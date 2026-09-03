/**
 * SuperAdmin Credit Routes — Platform-wide credit management
 */
import { z } from 'zod';
import { addCredits, getTenantCreditInfo, seedCreditRates, creditsToUsd, refreshRateCache, getRateCacheStatus, } from '../services/creditService.js';
import { requireSuperadmin, createAuditLog } from '../middleware/auth.js';
export async function registerSuperadminCreditRoutes(app) {
    // Apply superadmin auth to all routes in this module
    app.addHook('preHandler', requireSuperadmin());
    // ============================================
    // GET ALL CREDIT RATES
    // ============================================
    app.get('/credit-rates', async (request, reply) => {
        // Fills in any country not yet configured; never overwrites a set price.
        await seedCreditRates(app.prisma);
        const rates = await app.prisma.creditRate.findMany({
            orderBy: { countryName: 'asc' },
        });
        // Margin is what actually matters when setting a price, so it is computed
        // here rather than left for the operator to work out per row.
        const withMargin = rates.map((r) => {
            const margin = (sell, cost) => ({
                sell,
                cost,
                marginCredits: sell - cost,
                marginPct: cost > 0 ? Math.round(((sell - cost) / cost) * 1000) / 10 : null,
                sellUsd: creditsToUsd(sell),
                costUsd: creditsToUsd(cost),
            });
            return {
                id: r.id,
                countryCode: r.countryCode,
                countryName: r.countryName,
                currency: r.currency,
                isActive: r.isActive,
                marketing: margin(r.marketingCredits, r.metaMarketingCredits),
                utility: margin(r.utilityCredits, r.metaUtilityCredits),
                authentication: margin(r.authCredits, r.metaAuthCredits),
                service: { sell: r.serviceCredits, sellUsd: creditsToUsd(r.serviceCredits) },
                updatedAt: r.updatedAt,
            };
        });
        const priced = withMargin.filter((r) => r.marketing.cost > 0);
        const belowCost = withMargin.filter((r) => (r.marketing.cost > 0 && r.marketing.marginCredits < 0) ||
            (r.utility.cost > 0 && r.utility.marginCredits < 0) ||
            (r.authentication.cost > 0 && r.authentication.marginCredits < 0));
        return {
            success: true,
            data: {
                rates: withMargin,
                summary: {
                    countries: withMargin.length,
                    creditsPerDollar: 10000,
                    // A country priced under Meta's cost loses money on every message,
                    // which is easy to do by hand across 100+ rows and invisible without
                    // this call-out.
                    belowCost: belowCost.map((r) => r.countryCode),
                    averageMarketingMarginPct: priced.length
                        ? Math.round((priced.reduce((n, r) => n + (r.marketing.marginPct ?? 0), 0) / priced.length) * 10) / 10
                        : null,
                },
                cache: getRateCacheStatus(),
            },
        };
    });
    // ============================================
    // UPDATE ONE COUNTRY'S RATES
    // ============================================
    app.patch('/credit-rates/:rateId', async (request, reply) => {
        const { rateId } = z.object({ rateId: z.string() }).parse(request.params);
        const body = z.object({
            marketingCredits: z.number().int().min(0).optional(),
            utilityCredits: z.number().int().min(0).optional(),
            authCredits: z.number().int().min(0).optional(),
            serviceCredits: z.number().int().min(0).optional(),
            isActive: z.boolean().optional(),
        }).parse(request.body);
        const rate = await app.prisma.creditRate.update({ where: { id: rateId }, data: body });
        // Billing reads a cache, so a price change is inert until it is reloaded.
        await refreshRateCache(app.prisma);
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'UPDATE_CREDIT_RATE',
            resource: 'credit_rates',
            resourceId: rate.id,
            metadata: { countryCode: rate.countryCode, ...body },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: rate };
    });
    // ============================================
    // BULK MARKUP — reprice every country from Meta's cost
    // ============================================
    app.post('/credit-rates/apply-markup', async (request, reply) => {
        const { markup, categories, countryCodes } = z.object({
            markup: z.number().min(1).max(10),
            categories: z.array(z.enum(['marketing', 'utility', 'authentication'])).min(1),
            countryCodes: z.array(z.string()).optional(),
        }).parse(request.body);
        const rates = await app.prisma.creditRate.findMany({
            where: countryCodes?.length ? { countryCode: { in: countryCodes } } : undefined,
        });
        let updated = 0;
        for (const r of rates) {
            const data = {};
            // Repricing from a recorded cost of 0 would set the price to 0 and give
            // that country away, so those rows are skipped rather than zeroed.
            if (categories.includes('marketing') && r.metaMarketingCredits > 0) {
                data.marketingCredits = Math.max(1, Math.round(r.metaMarketingCredits * markup));
            }
            if (categories.includes('utility') && r.metaUtilityCredits > 0) {
                data.utilityCredits = Math.max(1, Math.round(r.metaUtilityCredits * markup));
            }
            if (categories.includes('authentication') && r.metaAuthCredits > 0) {
                data.authCredits = Math.max(1, Math.round(r.metaAuthCredits * markup));
            }
            if (Object.keys(data).length === 0)
                continue;
            await app.prisma.creditRate.update({ where: { id: r.id }, data });
            updated++;
        }
        await refreshRateCache(app.prisma);
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'BULK_APPLY_CREDIT_MARKUP',
            resource: 'credit_rates',
            metadata: { markup, categories, countries: updated },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return {
            success: true,
            data: { updated, skipped: rates.length - updated, markup, message: `Repriced ${updated} country/countries at ${markup}x Meta's cost.` },
        };
    });
    // ============================================
    // GET TENANT CREDIT DETAILS
    // ============================================
    app.get('/tenants/:tenantId/credits', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const info = await getTenantCreditInfo(app.prisma, tenantId);
        // Also get tenant info
        const tenant = await app.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true, billingEmail: true },
        });
        if (!tenant) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        return {
            success: true,
            data: {
                tenant: { id: tenant.id, name: tenant.name, billingEmail: tenant.billingEmail },
                credits: {
                    balance: info?.balance || 0,
                    totalPurchased: info?.totalPurchased || 0,
                    totalUsed: info?.totalUsed || 0,
                    balanceUsd: creditsToUsd(info?.balance || 0).toFixed(2),
                },
                transactions: (info?.transactions || []).map((t) => ({
                    id: t.id,
                    type: t.type,
                    amount: t.amount,
                    description: t.description,
                    referenceId: t.referenceId,
                    referenceType: t.referenceType,
                    balanceAfter: t.balanceAfter,
                    createdAt: t.createdAt,
                })),
            },
        };
    });
    // ============================================
    // ADD CREDITS TO TENANT
    // ============================================
    app.post('/tenants/:tenantId/credits', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const body = z.object({
            amount: z.number().min(1),
            type: z.enum(['BONUS', 'ADJUSTMENT', 'PURCHASE', 'REFUND']),
            description: z.string().optional(),
        }).parse(request.body);
        const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        const result = await addCredits(app.prisma, tenantId, body.amount, body.type, undefined, body.description || `${body.type} credits`);
        // Create audit log
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'CREDIT_ADDED',
            resource: 'credits',
            resourceId: tenantId,
            tenantId,
            metadata: { amount: body.amount, type: body.type, newBalance: result.balanceAfter, reason: body.description || `${body.type} credits` },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return {
            success: true,
            data: {
                creditsAdded: body.amount,
                balanceAfter: result.balanceAfter,
                balanceUsd: creditsToUsd(result.balanceAfter).toFixed(2),
            },
        };
    });
    // ============================================
    // DEDUCT CREDITS FROM TENANT
    // ============================================
    app.post('/tenants/:tenantId/credits/deduct', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const body = z.object({
            amount: z.number().min(1),
            description: z.string().optional(),
        }).parse(request.body);
        const { deductCredits } = await import('../services/creditService.js');
        const result = await deductCredits(app.prisma, tenantId, body.amount, `admin-deduct-${Date.now()}`, 'ADMIN_DEDUCTION', body.description || 'Manual deduction by admin');
        if (!result.success) {
            return reply.status(400).send({ success: false, error: { code: result.error } });
        }
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'CREDIT_DEDUCTED',
            resource: 'credits',
            resourceId: tenantId,
            tenantId,
            metadata: { amount: -body.amount, newBalance: result.balanceAfter, reason: body.description || 'Manual deduction by admin' },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return {
            success: true,
            data: {
                creditsDeducted: body.amount,
                balanceAfter: result.balanceAfter,
            },
        };
    });
    // ============================================
    // CREDIT PACKS MANAGEMENT
    // ============================================
    app.get('/credit-packs', async (request, reply) => {
        const packs = await app.prisma.creditPack.findMany({
            orderBy: { credits: 'asc' },
        });
        return { success: true, data: packs };
    });
    app.post('/credit-packs', async (request, reply) => {
        const body = z.object({
            name: z.string().min(1),
            credits: z.number().min(1),
            priceUsd: z.number().min(0),
            description: z.string().optional(),
            isPopular: z.boolean().optional(),
        }).parse(request.body);
        const pack = await app.prisma.creditPack.create({
            data: {
                name: body.name,
                credits: body.credits,
                priceUsd: body.priceUsd,
                description: body.description,
                isPopular: body.isPopular || false,
            },
        });
        return reply.status(201).send({ success: true, data: pack });
    });
    app.patch('/credit-packs/:packId', async (request, reply) => {
        const { packId } = z.object({ packId: z.string() }).parse(request.params);
        const body = z.object({
            name: z.string().optional(),
            credits: z.number().optional(),
            priceUsd: z.number().optional(),
            description: z.string().optional(),
            isPopular: z.boolean().optional(),
            isActive: z.boolean().optional(),
        }).parse(request.body);
        const pack = await app.prisma.creditPack.update({
            where: { id: packId },
            data: body,
        });
        return { success: true, data: pack };
    });
    app.delete('/credit-packs/:packId', async (request, reply) => {
        const { packId } = z.object({ packId: z.string() }).parse(request.params);
        await app.prisma.creditPack.delete({ where: { id: packId } });
        return { success: true, data: { message: 'Pack deleted' } };
    });
    // ============================================
    // PLATFORM-WIDE CREDIT STATS
    // ============================================
    app.get('/credit-stats', async (request, reply) => {
        const [totalCredits, totalPurchased, totalUsed, topTenants] = await Promise.all([
            app.prisma.tenantCredit.aggregate({ _sum: { balance: true } }),
            app.prisma.tenantCredit.aggregate({ _sum: { totalPurchased: true } }),
            app.prisma.tenantCredit.aggregate({ _sum: { totalUsed: true } }),
            app.prisma.tenantCredit.findMany({
                orderBy: { balance: 'desc' },
                take: 10,
                include: { tenant: { select: { id: true, name: true, billingEmail: true } } },
            }),
        ]);
        return {
            success: true,
            data: {
                totalCredits: totalCredits._sum.balance || 0,
                totalCreditsUsd: creditsToUsd(totalCredits._sum.balance || 0).toFixed(2),
                totalPurchased: totalPurchased._sum.totalPurchased || 0,
                totalPurchasedUsd: creditsToUsd(totalPurchased._sum.totalPurchased || 0).toFixed(2),
                totalUsed: totalUsed._sum.totalUsed || 0,
                totalUsedUsd: creditsToUsd(totalUsed._sum.totalUsed || 0).toFixed(2),
                topTenants: topTenants.map((t) => ({
                    tenantId: t.tenantId,
                    name: t.tenant.name,
                    billingEmail: t.tenant.billingEmail,
                    balance: t.balance,
                    balanceUsd: creditsToUsd(t.balance).toFixed(2),
                })),
            },
        };
    });
    // ============================================
    // SEED DEFAULT CREDIT PACKS
    // ============================================
    app.post('/credit-packs/seed', async (request, reply) => {
        const packs = [
            { name: 'Starter Pack', credits: 1000, priceUsd: 10, isPopular: false },
            { name: 'Growth Pack', credits: 5000, priceUsd: 40, isPopular: true },
            { name: 'Business Pack', credits: 15000, priceUsd: 100, isPopular: false },
            { name: 'Enterprise Pack', credits: 50000, priceUsd: 300, isPopular: false },
        ];
        for (const pack of packs) {
            await app.prisma.creditPack.upsert({
                where: { id: pack.name.toLowerCase().replace(' ', '-') },
                create: { id: pack.name.toLowerCase().replace(' ', '-'), ...pack },
                update: pack,
            });
        }
        return { success: true, data: { message: 'Credit packs seeded', count: packs.length } };
    });
}
//# sourceMappingURL=superadminCredits.js.map