// SUPERADMIN ROUTES -- Platform administration
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { createAuditLog } from '../middleware/auth.js';
const paginationSchema = z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sort: z.string().default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
});
/**
 * Register superadmin routes
 */
export async function registerSuperadminRoutes(app) {
    // Apply superadmin middleware to all routes
    app.addHook('preHandler', async (request, reply) => {
        // Previously logged the whole authUser object on every superadmin request —
        // noise in the logs, and it wrote identity details to disk on each call.
        if (!request.authUser?.isSuperadmin) {
            return reply.status(403).send({
                success: false,
                error: { code: 'FORBIDDEN', message: 'Superadmin access required' },
            });
        }
    });
    // ============================================
    // DASHBOARD
    // ============================================
    app.get('/dashboard', async (request, reply) => {
        const [totalTenants, activeTenants, totalMessages, totalContacts, planGroups, openTickets,] = await Promise.all([
            app.prisma.tenant.count(),
            app.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
            app.prisma.message.count({ where: { direction: 'OUTGOING' } }),
            app.prisma.contact.count(),
            app.prisma.tenant.findMany({
                where: { status: { in: ['ACTIVE'] } },
                select: { plan: { select: { monthlyPrice: true } } },
            }),
            app.prisma.ticket.count({ where: { status: 'OPEN' } }),
        ]);
        // Calculate real MRR from active tenants' plan prices
        const mrr = planGroups.reduce((sum, t) => {
            const raw = t.plan?.monthlyPrice;
            const price = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
            return sum + (isNaN(price) ? 0 : price);
        }, 0);
        return {
            success: true,
            data: {
                totalTenants,
                activeTenants,
                totalMessages,
                totalContacts,
                mrr,
                openTickets,
                trialTenants: totalTenants - activeTenants,
            },
        };
    });
    // ============================================
    // WHATSAPP HEALTH — cross-tenant Meta status
    // ============================================
    /**
     * GET /superadmin/whatsapp-health
     *
     * Answers "which of my customers is broken right now" in one request — the
     * thing that stops being answerable by opening each tenant individually once
     * there is more than a handful of them.
     *
     * Served entirely from our own tables. The per-phone quality, name status and
     * messaging tier are already cached there by the refresh path, so this stays
     * fast and keeps working when Meta is slow or refusing calls. It is a
     * dashboard, not a source of truth: a stale field here means someone should
     * refresh that number, not that this endpoint should start fanning out live
     * Graph requests per tenant.
     */
    app.get('/whatsapp-health', async (request, reply) => {
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        // Six aggregate queries regardless of tenant count, rather than a per-tenant
        // loop that would grow linearly with customers.
        const [tenants, creds, phones, templateCounts, messageCounts, lastWebhooks] = await Promise.all([
            app.prisma.tenant.findMany({
                select: { id: true, name: true, status: true, createdAt: true, plan: { select: { name: true } } },
                orderBy: { createdAt: 'desc' },
            }),
            app.prisma.whatsAppCredentials.findMany({
                select: { tenantId: true, wabaId: true, accessToken: true, isConfigured: true, lastError: true, lastTestedAt: true },
            }),
            app.prisma.phoneNumber.findMany({
                select: {
                    tenantId: true, phoneNumber: true, displayName: true, status: true,
                    qualityScore: true, nameStatus: true, messagingLimitTier: true,
                    metaPhoneId: true, accessToken: true, todaySentCount: true, dailySentLimit: true,
                },
            }),
            app.prisma.template.groupBy({ by: ['tenantId', 'status'], _count: { _all: true } }),
            app.prisma.message.groupBy({
                by: ['tenantId', 'status'],
                where: { direction: 'OUTGOING', createdAt: { gte: since24h } },
                _count: { _all: true },
            }),
            app.prisma.webhookLog.groupBy({ by: ['tenantId'], _max: { createdAt: true } }),
        ]);
        const credByTenant = new Map(creds.map(c => [c.tenantId, c]));
        const lastWebhookByTenant = new Map(lastWebhooks.map(w => [w.tenantId, w._max.createdAt]));
        const phonesByTenant = new Map();
        for (const ph of phones) {
            const arr = phonesByTenant.get(ph.tenantId) ?? [];
            arr.push(ph);
            phonesByTenant.set(ph.tenantId, arr);
        }
        const tally = (rows) => {
            const m = new Map();
            for (const r of rows) {
                const t = m.get(r.tenantId) ?? {};
                t[r.status] = (t[r.status] ?? 0) + r._count._all;
                m.set(r.tenantId, t);
            }
            return m;
        };
        const templatesByTenant = tally(templateCounts);
        const messagesByTenant = tally(messageCounts);
        const rows = tenants.map(t => {
            const cred = credByTenant.get(t.id);
            const tPhones = phonesByTenant.get(t.id) ?? [];
            const tpl = templatesByTenant.get(t.id) ?? {};
            const msg = messagesByTenant.get(t.id) ?? {};
            const livePhones = tPhones.filter(p => p.metaPhoneId);
            const hasToken = !!cred?.accessToken || tPhones.some(p => p.accessToken);
            const sent = (msg.SENT ?? 0) + (msg.DELIVERED ?? 0) + (msg.READ ?? 0);
            const failed = msg.FAILED ?? 0;
            const attempted = sent + failed;
            // Where this tenant actually is, rather than what they were sold.
            const stage = !hasToken || !cred?.wabaId ? 'NOT_CONNECTED'
                : livePhones.length === 0 ? 'NO_PHONE'
                    : (tpl.APPROVED ?? 0) === 0 ? 'NO_TEMPLATE'
                        : attempted === 0 ? 'READY'
                            : 'SENDING';
            // Only things an operator would actually act on.
            const issues = [];
            if (cred?.lastError)
                issues.push(`Credential error: ${cred.lastError}`);
            if (livePhones.some(p => p.qualityScore === 'RED'))
                issues.push('A number is rated RED by Meta');
            if (livePhones.some(p => p.nameStatus === 'DECLINED'))
                issues.push('A display name was declined');
            if ((tpl.REJECTED ?? 0) > 0)
                issues.push(`${tpl.REJECTED} template(s) rejected`);
            if (attempted >= 10 && failed / attempted > 0.25) {
                issues.push(`${Math.round((failed / attempted) * 100)}% of sends failed in 24h`);
            }
            if (livePhones.some(p => p.dailySentLimit > 0 && p.todaySentCount / p.dailySentLimit > 0.8)) {
                issues.push('A number is near its daily send limit');
            }
            return {
                tenantId: t.id,
                name: t.name,
                tenantStatus: t.status,
                plan: t.plan?.name ?? null,
                createdAt: t.createdAt,
                stage,
                wabaId: cred?.wabaId ?? null,
                hasToken,
                lastTestedAt: cred?.lastTestedAt ?? null,
                lastWebhookAt: lastWebhookByTenant.get(t.id) ?? null,
                phones: {
                    total: tPhones.length,
                    connected: livePhones.length,
                    quality: {
                        GREEN: livePhones.filter(p => p.qualityScore === 'GREEN').length,
                        YELLOW: livePhones.filter(p => p.qualityScore === 'YELLOW').length,
                        RED: livePhones.filter(p => p.qualityScore === 'RED').length,
                        UNKNOWN: livePhones.filter(p => !p.qualityScore || p.qualityScore === 'UNKNOWN').length,
                    },
                    list: livePhones.map(p => ({
                        phoneNumber: p.phoneNumber,
                        displayName: p.displayName,
                        status: p.status,
                        qualityScore: p.qualityScore ?? 'UNKNOWN',
                        nameStatus: p.nameStatus ?? 'UNKNOWN',
                        messagingLimitTier: p.messagingLimitTier,
                        todaySentCount: p.todaySentCount,
                        dailySentLimit: p.dailySentLimit,
                    })),
                },
                templates: {
                    approved: tpl.APPROVED ?? 0,
                    pending: tpl.PENDING ?? 0,
                    rejected: tpl.REJECTED ?? 0,
                    draft: tpl.DRAFT ?? 0,
                },
                messages24h: { sent, failed, attempted },
                issues,
            };
        });
        const summary = {
            tenants: rows.length,
            connected: rows.filter(r => r.stage !== 'NOT_CONNECTED').length,
            sending: rows.filter(r => r.stage === 'SENDING').length,
            withIssues: rows.filter(r => r.issues.length > 0).length,
            phonesConnected: rows.reduce((n, r) => n + r.phones.connected, 0),
            templatesPending: rows.reduce((n, r) => n + r.templates.pending, 0),
            messages24h: {
                sent: rows.reduce((n, r) => n + r.messages24h.sent, 0),
                failed: rows.reduce((n, r) => n + r.messages24h.failed, 0),
            },
        };
        // Anything needing attention first — an operator opens this to find problems.
        rows.sort((a, b) => b.issues.length - a.issues.length);
        return { success: true, data: { summary, tenants: rows, generatedAt: new Date().toISOString() } };
    });
    /**
     * GET /superadmin/whatsapp-accounts
     *
     * Every WABA this platform owns, plus every one a customer has shared with us
     * via Embedded Signup. Uses the platform system user token, so it deliberately
     * lives behind superadmin: the tenant-facing /whatsapp/accounts must stay
     * scoped to the caller's own workspace, or each customer would see the others'
     * accounts.
     *
     * Cross-referenced against our tables so it is obvious which shared WABAs we
     * have actually onboarded and which are sitting unclaimed.
     */
    app.get('/whatsapp-accounts', async (request, reply) => {
        const systemToken = process.env.WHATSAPP_SYSTEM_USER_TOKEN;
        const businessId = process.env.META_BUSINESS_ID;
        if (!systemToken || !businessId) {
            return {
                success: true,
                data: {
                    configured: false,
                    owned: [],
                    client: [],
                    note: 'Set WHATSAPP_SYSTEM_USER_TOKEN and META_BUSINESS_ID to list accounts across all customers.',
                },
            };
        }
        const fields = 'id,name,currency,owner_business_info,on_behalf_of_business_info';
        try {
            const [ownedRes, clientRes] = await Promise.all([
                fetch(`https://graph.facebook.com/v21.0/${businessId}/owned_whatsapp_business_accounts?fields=${fields}&limit=100&access_token=${systemToken}`),
                fetch(`https://graph.facebook.com/v21.0/${businessId}/client_whatsapp_business_accounts?fields=${fields}&limit=100&access_token=${systemToken}`),
            ]);
            const [ownedData, clientData] = await Promise.all([ownedRes.json(), clientRes.json()]);
            if (!ownedRes.ok) {
                return reply.status(502).send({
                    success: false,
                    error: { code: 'META_ERROR', message: ownedData?.error?.message || 'Meta refused the request' },
                });
            }
            // Which of these are actually wired to a tenant on our side? A WABA Meta
            // knows about but we don't is a customer who started onboarding and never
            // finished — worth seeing.
            const known = await app.prisma.phoneNumber.findMany({
                where: { wabaId: { not: null } },
                select: { wabaId: true, tenant: { select: { id: true, name: true } } },
            });
            const tenantByWaba = new Map();
            for (const k of known)
                if (k.wabaId && k.tenant)
                    tenantByWaba.set(k.wabaId, k.tenant);
            const decorate = (list) => (list ?? []).map((w) => ({
                id: w.id,
                name: w.name,
                currency: w.currency ?? null,
                ownerBusiness: w.owner_business_info?.name ?? null,
                linkedTenant: tenantByWaba.get(w.id) ?? null,
            }));
            const owned = decorate(ownedData.data);
            const client = decorate(clientData?.data);
            return {
                success: true,
                data: {
                    configured: true,
                    businessId,
                    owned,
                    client,
                    unclaimed: [...owned, ...client].filter(w => !w.linkedTenant).length,
                    clientError: clientRes.ok ? null : clientData?.error?.message ?? null,
                },
            };
        }
        catch (err) {
            return reply.status(502).send({
                success: false,
                error: { code: 'META_UNREACHABLE', message: `Could not reach Meta: ${err.message}` },
            });
        }
    });
    // ============================================
    // TENANT MANAGEMENT
    // ============================================
    app.get('/tenants', async (request, reply) => {
        const query = paginationSchema.extend({
            search: z.string().optional(),
            status: z.string().optional(),
        }).parse(request.query);
        const { page, limit, sort, order, search, status } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (status && status !== 'all') {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { website: { contains: search, mode: 'insensitive' } },
            ];
        }
        const [tenants, total] = await Promise.all([
            app.prisma.tenant.findMany({
                where,
                orderBy: { [sort]: order },
                skip,
                take: limit,
                include: { plan: true, _count: { select: { contacts: true } } },
            }),
            app.prisma.tenant.count({ where }),
        ]);
        return {
            success: true,
            data: tenants.map(t => ({
                ...t,
                planName: t.plan?.name || null,
                plan: t.plan || null,
                currentContacts: t._count?.contacts ?? 0,
            })),
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    });
    app.get('/tenants/:tenantId', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const tenant = await app.prisma.tenant.findUnique({
            where: { id: tenantId },
            include: {
                plan: true,
                users: { select: { id: true, name: true, email: true, role: true, isActive: true } },
            },
        });
        if (!tenant) {
            return reply.status(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Tenant not found' },
            });
        }
        return { success: true, data: tenant };
    });
    app.post('/tenants', async (request, reply) => {
        const schema = z.object({
            name: z.string().min(1),
            email: z.string().email(),
            password: z.string().min(8).optional(),
            planId: z.string().optional(),
            website: z.string().url().optional().nullable(),
            billingEmail: z.string().email().optional(),
        });
        const body = schema.parse(request.body);
        // Check if email exists
        const existing = await app.prisma.user.findFirst({
            where: { email: body.email },
        });
        if (existing) {
            return reply.status(409).send({
                success: false,
                error: { code: 'EMAIL_EXISTS', message: 'Email already registered' },
            });
        }
        // Generate random password if not provided
        const passwordToUse = body.password || Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase() + '!';
        const hashedPassword = await bcrypt.hash(passwordToUse, 12);
        const tenant = await app.prisma.tenant.create({
            data: {
                name: body.name,
                website: body.website || null,
                billingEmail: body.billingEmail || body.email,
                status: 'TRIAL',
                planId: body.planId,
                isOnTrial: true,
                trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
                users: {
                    create: {
                        email: body.email,
                        name: body.name.split(' ')[0],
                        password: hashedPassword,
                        role: 'OWNER',
                        isActive: true,
                    },
                },
            },
            include: { users: true },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'CREATE',
            resource: 'tenants',
            resourceId: tenant.id,
            tenantId: tenant.id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.status(201).send({ success: true, data: { ...tenant, tempPassword: passwordToUse } });
    });
    app.patch('/tenants/:tenantId', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const body = z.object({
            name: z.string().optional(),
            planId: z.string().optional(),
            status: z.enum(['TRIAL', 'ACTIVE', 'SUSPENDED', 'CHURNED', 'PENDING_SETUP']).optional(),
        }).parse(request.body);
        const tenant = await app.prisma.tenant.update({
            where: { id: tenantId },
            data: body,
            include: { plan: true },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'UPDATE',
            resource: 'tenants',
            resourceId: tenant.id,
            metadata: body,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: tenant };
    });
    app.post('/tenants/:tenantId/suspend', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const tenant = await app.prisma.tenant.update({
            where: { id: tenantId },
            data: { status: 'SUSPENDED', suspendedAt: new Date() },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'SUSPEND',
            resource: 'tenants',
            resourceId: tenant.id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: tenant };
    });
    app.post('/tenants/:tenantId/reactivate', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const tenant = await app.prisma.tenant.update({
            where: { id: tenantId },
            data: { status: 'ACTIVE', suspendedAt: null },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'REACTIVATE',
            resource: 'tenants',
            resourceId: tenant.id,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: tenant };
    });
    // ============================================
    // TENANT USER MANAGEMENT
    // ============================================
    // Get all users for a specific tenant
    app.get('/tenants/:tenantId/users', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const users = await app.prisma.user.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isActive: true,
                createdAt: true,
                lastLoginAt: true,
                avatarUrl: true,
                avatarGender: true,
            },
        });
        return { success: true, data: users };
    });
    // Create/invite a user for a specific tenant
    app.post('/tenants/:tenantId/users', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const schema = z.object({
            email: z.string().email(),
            name: z.string().min(1),
            password: z.string().min(8).optional(),
            role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'VIEWER']).default('AGENT'),
        });
        const body = schema.parse(request.body);
        // Check if user already exists
        const existing = await app.prisma.user.findUnique({
            where: { tenantId_email: { tenantId, email: body.email } },
        });
        if (existing) {
            return reply.status(409).send({
                success: false,
                error: { code: 'EMAIL_EXISTS', message: 'User with this email already exists in this tenant' },
            });
        }
        // Generate temp password if not provided
        const tempPassword = body.password || Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        const user = await app.prisma.user.create({
            data: {
                email: body.email,
                name: body.name,
                password: hashedPassword,
                role: body.role,
                tenantId,
            },
        });
        return reply.status(201).send({
            success: true,
            data: { user, tempPassword },
        });
    });
    // Reset password for a tenant user
    app.post('/tenants/:tenantId/users/:userId/reset-password', async (request, reply) => {
        const { tenantId, userId } = z.object({
            tenantId: z.string(),
            userId: z.string(),
        }).parse(request.params);
        const { password } = z.object({
            password: z.string().min(8).optional(),
        }).parse(request.body || {});
        const tempPassword = password || Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 12);
        await app.prisma.user.updateMany({
            where: { id: userId, tenantId },
            data: { password: hashedPassword },
        });
        return {
            success: true,
            data: { message: 'Password reset successfully', tempPassword },
        };
    });
    // Update tenant user (role, active status)
    app.patch('/tenants/:tenantId/users/:userId', async (request, reply) => {
        const { tenantId, userId } = z.object({
            tenantId: z.string(),
            userId: z.string(),
        }).parse(request.params);
        const body = z.object({
            role: z.enum(['ADMIN', 'MANAGER', 'AGENT', 'VIEWER']).optional(),
            isActive: z.boolean().optional(),
            name: z.string().optional(),
            avatarGender: z.enum(['boy', 'girl']).nullable().optional(),
        }).parse(request.body);
        await app.prisma.user.updateMany({
            where: { id: userId, tenantId },
            data: body,
        });
        return { success: true, data: { message: 'User updated' } };
    });
    // ============================================
    // PLAN MANAGEMENT
    // ============================================
    app.get('/plans', async (request, reply) => {
        const plans = await app.prisma.plan.findMany({
            orderBy: { sortOrder: 'asc' },
        });
        return { success: true, data: plans };
    });
    app.post('/plans', async (request, reply) => {
        const schema = z.object({
            name: z.string().min(1),
            tier: z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']),
            monthlyPrice: z.number().min(0),
            annualPrice: z.number().min(0),
            description: z.string().optional(),
        });
        const body = schema.parse(request.body);
        const plan = await app.prisma.plan.create({
            data: body,
        });
        return reply.status(201).send({ success: true, data: plan });
    });
    // UPDATE a plan
    app.patch('/plans/:planId', async (request, reply) => {
        const { planId } = z.object({ planId: z.string() }).parse(request.params);
        const body = z.object({
            name: z.string().optional(),
            monthlyPrice: z.number().min(0).optional(),
            annualPrice: z.number().min(0).optional(),
            description: z.string().optional(),
            sortOrder: z.number().optional(),
        }).parse(request.body);
        const plan = await app.prisma.plan.update({
            where: { id: planId },
            data: body,
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'UPDATE',
            resource: 'plans',
            resourceId: plan.id,
            metadata: body,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: plan };
    });
    // DELETE a plan
    app.delete('/plans/:planId', async (request, reply) => {
        const { planId } = z.object({ planId: z.string() }).parse(request.params);
        // Check if any tenants are using this plan
        const tenantsOnPlan = await app.prisma.tenant.count({ where: { planId } });
        if (tenantsOnPlan > 0) {
            return reply.status(400).send({
                success: false,
                error: { code: 'PLAN_IN_USE', message: `Cannot delete plan: ${tenantsOnPlan} tenant(s) are currently on this plan` },
            });
        }
        await app.prisma.plan.delete({ where: { id: planId } });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'DELETE',
            resource: 'plans',
            resourceId: planId,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: { message: 'Plan deleted' } };
    });
    // ============================================
    // SUPPORT TICKETS
    // ============================================
    app.get('/tickets', async (request, reply) => {
        const query = paginationSchema.extend({
            search: z.string().optional(),
            status: z.string().optional(),
        }).parse(request.query);
        const { page, limit, sort, order, search, status } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (status && status !== 'all') {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { subject: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { tenant: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }
        const [tickets, total] = await Promise.all([
            app.prisma.ticket.findMany({
                where,
                orderBy: { [sort]: order },
                skip,
                take: limit,
                include: {
                    tenant: { select: { id: true, name: true } },
                    assignedTo: { select: { id: true, name: true } },
                },
            }),
            app.prisma.ticket.count({ where }),
        ]);
        return {
            success: true,
            data: tickets,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    });
    app.get('/tickets/:ticketId', async (request, reply) => {
        const { ticketId } = z.object({ ticketId: z.string() }).parse(request.params);
        const ticket = await app.prisma.ticket.findUnique({
            where: { id: ticketId },
            include: {
                tenant: true,
                assignedTo: { select: { id: true, name: true } },
                messages: { orderBy: { createdAt: 'asc' } },
            },
        });
        if (!ticket) {
            return reply.status(404).send({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Ticket not found' },
            });
        }
        return { success: true, data: ticket };
    });
    app.patch('/tickets/:ticketId', async (request, reply) => {
        const { ticketId } = z.object({ ticketId: z.string() }).parse(request.params);
        const body = z.object({
            status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).optional(),
            priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
            assignedToId: z.string().nullable().optional(),
        }).parse(request.body);
        const ticket = await app.prisma.ticket.update({
            where: { id: ticketId },
            data: {
                ...body,
                resolvedAt: body.status === 'RESOLVED' ? new Date() : undefined,
            },
        });
        return { success: true, data: ticket };
    });
    // CREATE a ticket (superadmin can create on behalf of tenant)
    app.post('/tickets', async (request, reply) => {
        const body = z.object({
            subject: z.string().min(1),
            description: z.string().min(1),
            priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
            category: z.string().optional(),
            tenantId: z.string(),
        }).parse(request.body);
        const ticket = await app.prisma.ticket.create({
            data: {
                subject: body.subject,
                description: body.description,
                priority: body.priority,
                category: body.category || null,
                status: 'OPEN',
                tenantId: body.tenantId,
            },
            include: {
                tenant: { select: { id: true, name: true } },
            },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'CREATE',
            resource: 'tickets',
            resourceId: ticket.id,
            tenantId: body.tenantId,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return reply.status(201).send({ success: true, data: ticket });
    });
    // ============================================
    // AUDIT LOGS
    // ============================================
    app.get('/audit-logs', async (request, reply) => {
        const query = paginationSchema.extend({
            action: z.string().optional(),
            resource: z.string().optional(),
            tenantId: z.string().optional(),
        }).parse(request.query);
        const { page, limit, sort, order, action, resource, tenantId } = query;
        const skip = (page - 1) * limit;
        const where = {};
        if (action) {
            const actions = action.split(',').map(a => a.trim());
            where.action = actions.length === 1 ? actions[0] : { in: actions };
        }
        if (resource) {
            where.resource = resource;
        }
        if (tenantId) {
            where.tenantId = tenantId;
        }
        const [logs, total] = await Promise.all([
            app.prisma.auditLog.findMany({
                where,
                orderBy: { [sort]: order },
                skip,
                take: limit,
                include: {
                    tenant: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true, email: true } },
                    superadmin: { select: { id: true, name: true, email: true } },
                },
            }),
            app.prisma.auditLog.count({ where }),
        ]);
        return {
            success: true,
            data: logs,
            meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    });
    // ============================================
    // BILLING OVERVIEW
    // ============================================
    app.get('/billing', async (request, reply) => {
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        const [activeTenants, trialTenants, churnedTenants, allTenants, recentInvoices, paidInvoices] = await Promise.all([
            app.prisma.tenant.findMany({ where: { status: 'ACTIVE' }, include: { plan: true } }),
            app.prisma.tenant.findMany({ where: { status: 'TRIAL' } }),
            app.prisma.tenant.count({ where: { status: 'CHURNED' } }),
            app.prisma.tenant.count(),
            app.prisma.invoice.findMany({
                take: 10,
                orderBy: { createdAt: 'desc' },
                include: { tenant: { select: { name: true } } },
            }),
            app.prisma.invoice.findMany({
                where: { status: 'paid', paidAt: { gte: sixMonthsAgo } },
                select: { amount: true, paidAt: true },
            }),
        ]);
        const monthlyRevenue = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString('en-US', { month: 'short' });
            const total = paidInvoices
                .filter((inv) => inv.paidAt && inv.paidAt.getFullYear() === d.getFullYear() && inv.paidAt.getMonth() === d.getMonth())
                .reduce((sum, inv) => sum + Number(inv.amount), 0);
            monthlyRevenue.push({ month: label, mrr: total });
        }
        const mrr = activeTenants.reduce((sum, t) => {
            const raw = t.plan?.monthlyPrice;
            const price = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
            return sum + (isNaN(price) ? 0 : price);
        }, 0);
        const planCounts = {};
        const planMRR = {};
        for (const t of activeTenants) {
            const tier = (t.plan?.tier || 'STARTER').toUpperCase();
            planCounts[tier] = (planCounts[tier] || 0) + 1;
            const raw = t.plan?.monthlyPrice;
            const price = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
            planMRR[tier] = (planMRR[tier] || 0) + (isNaN(price) ? 0 : price);
        }
        const planBreakdown = Object.entries(planCounts).map(([tier, count]) => ({
            tier, count, mrr: planMRR[tier] || 0,
        }));
        // Calculate real churn rate and LTV
        const churnRate = allTenants > 0 ? ((churnedTenants / allTenants) * 100) : 0;
        const avgMRRPerTenant = activeTenants.length > 0 ? mrr / activeTenants.length : 0;
        const ltv = churnRate > 0 ? (avgMRRPerTenant / (churnRate / 100)) * 12 : avgMRRPerTenant * 24;
        const recentEvents = recentInvoices.map((inv) => ({
            type: inv.status === 'paid' ? 'invoice.paid' :
                inv.status === 'failed' ? 'invoice.payment_failed' :
                    inv.status === 'void' ? 'invoice.voided' :
                        'invoice.created',
            tenant: inv.tenant?.name || 'Unknown',
            amount: inv.status === 'failed' ? `- $${Number(inv.amount).toFixed(2)}` : `+ $${Number(inv.amount).toFixed(2)}`,
            color: inv.status === 'paid' ? 'green' : inv.status === 'failed' ? 'red' : 'blue',
            date: inv.paidAt || inv.createdAt,
        }));
        const billing = {
            totalMRR: mrr,
            totalARR: mrr * 12,
            activeSubscriptions: activeTenants.length,
            trialSubscriptions: trialTenants.length,
            churnRate: Math.round(churnRate * 10) / 10,
            ltv: Math.round(ltv),
            planBreakdown,
            recentEvents,
            monthlyRevenue,
        };
        return { success: true, data: billing };
    });
    // ============================================
    // TENANT STATS
    // ============================================
    app.get('/tenants/:tenantId/stats', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const [contacts, messages, phoneNumbers, templates, campaigns, users] = await Promise.all([
            app.prisma.contact.count({ where: { tenantId } }),
            app.prisma.message.count({ where: { tenantId, direction: 'OUTGOING' } }),
            app.prisma.phoneNumber.count({ where: { tenantId } }),
            app.prisma.template.count({ where: { tenantId } }),
            app.prisma.campaign.count({ where: { tenantId } }),
            app.prisma.user.count({ where: { tenantId } }),
        ]);
        return {
            success: true,
            data: {
                contacts,
                messages,
                phoneNumbers,
                templates,
                campaigns,
                teamMembers: users,
            },
        };
    });
    // ============================================
    // DELETE TENANT USER
    // ============================================
    app.delete('/tenants/:tenantId/users/:userId', async (request, reply) => {
        const { tenantId, userId } = z.object({
            tenantId: z.string(),
            userId: z.string(),
        }).parse(request.params);
        // Prevent deleting owner
        const user = await app.prisma.user.findUnique({ where: { id: userId } });
        if (user?.role === 'OWNER') {
            return reply.status(400).send({
                success: false,
                error: { code: 'CANNOT_DELETE_OWNER', message: 'Cannot delete tenant owner' },
            });
        }
        await app.prisma.user.deleteMany({ where: { id: userId, tenantId } });
        return { success: true, data: { message: 'User deleted' } };
    });
    // ============================================
    // DELETE TENANT (soft delete — 30-day grace period, then purge)
    // ============================================
    const DELETION_GRACE_PERIOD_DAYS = 30;
    app.delete('/tenants/:tenantId', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        if (tenant.status === 'PENDING_DELETION') {
            return reply.status(400).send({
                success: false,
                error: { code: 'ALREADY_PENDING_DELETION', message: 'Tenant deletion is already scheduled.' },
            });
        }
        const scheduledPurgeAt = new Date(Date.now() + DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        await app.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                statusBeforeDeletion: tenant.status,
                status: 'PENDING_DELETION',
                deletionRequestedAt: new Date(),
                deletionRequestedById: request.authUser.id,
                scheduledPurgeAt,
            },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'REQUEST_DELETE',
            resource: 'tenants',
            resourceId: tenantId,
            metadata: { scheduledPurgeAt: scheduledPurgeAt.toISOString() },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return {
            success: true,
            data: {
                message: `Tenant scheduled for permanent deletion on ${scheduledPurgeAt.toISOString().slice(0, 10)}. Can be cancelled until then.`,
                scheduledPurgeAt,
            },
        };
    });
    // Cancel a pending deletion within the grace period
    app.post('/tenants/:tenantId/cancel-deletion', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant || tenant.status !== 'PENDING_DELETION') {
            return reply.status(400).send({
                success: false,
                error: { code: 'NOT_PENDING_DELETION', message: 'This tenant has no scheduled deletion to cancel.' },
            });
        }
        await app.prisma.tenant.update({
            where: { id: tenantId },
            data: {
                status: tenant.statusBeforeDeletion || 'ACTIVE',
                statusBeforeDeletion: null,
                deletionRequestedAt: null,
                deletionRequestedById: null,
                scheduledPurgeAt: null,
            },
        });
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'CANCEL_DELETE',
            resource: 'tenants',
            resourceId: tenantId,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: { message: 'Deletion cancelled. Tenant restored.' } };
    });
    // Permanently purge a tenant whose grace period has elapsed (irreversible)
    app.post('/tenants/:tenantId/purge', async (request, reply) => {
        const { tenantId } = z.object({ tenantId: z.string() }).parse(request.params);
        const { force } = z.object({ force: z.boolean().optional() }).parse(request.body || {});
        const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant || tenant.status !== 'PENDING_DELETION') {
            return reply.status(400).send({
                success: false,
                error: { code: 'NOT_PENDING_DELETION', message: 'Only tenants pending deletion can be purged.' },
            });
        }
        if (!force && tenant.scheduledPurgeAt && tenant.scheduledPurgeAt > new Date()) {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'GRACE_PERIOD_ACTIVE',
                    message: `Grace period active until ${tenant.scheduledPurgeAt.toISOString().slice(0, 10)}. Pass force:true to purge immediately.`,
                },
            });
        }
        // Cascade delete: users, contacts, messages, phone numbers, templates, campaigns, etc.
        await app.prisma.$transaction([
            app.prisma.message.deleteMany({ where: { tenantId } }),
            app.prisma.campaign.deleteMany({ where: { tenantId } }),
            app.prisma.template.deleteMany({ where: { tenantId } }),
            app.prisma.phoneNumber.deleteMany({ where: { tenantId } }),
            app.prisma.contact.deleteMany({ where: { tenantId } }),
            app.prisma.tenantCreditTransaction.deleteMany({ where: { credit: { tenantId } } }),
            app.prisma.ticket.deleteMany({ where: { tenantId } }),
            app.prisma.user.deleteMany({ where: { tenantId } }),
            app.prisma.tenant.delete({ where: { id: tenantId } }),
        ]);
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'PURGE',
            resource: 'tenants',
            resourceId: tenantId,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: { message: 'Tenant permanently deleted' } };
    });
    // ============================================
    // CREDIT EXPORT (CSV)
    // ============================================
    // GET credits export as CSV
    app.get('/credits/export', async (request, reply) => {
        const transactions = await app.prisma.tenantCreditTransaction.findMany({
            orderBy: { createdAt: 'desc' },
            take: 1000,
            include: {
                credit: {
                    include: {
                        tenant: { select: { id: true, name: true } },
                    },
                },
            },
        });
        const csvHeader = 'Date,Tenant,Type,Amount,Balance After,Description\n';
        const csvRows = transactions.map((tx) => `"${new Date(tx.createdAt).toISOString()}","${tx.credit?.tenant?.name || 'N/A'}","${tx.type}","${tx.amount}","${tx.balanceAfter || ''}","${(tx.description || '').replace(/"/g, '""')}"`).join('\n');
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename="credits_export.csv"');
        return reply.send(csvHeader + csvRows);
    });
    // ============================================
    // SETTINGS (persisted via key-value in memory, production should use DB)
    // ============================================
    // In-memory settings store (persists for server lifetime)
    const platformSettings = {
        platformName: 'WhatsApp SaaS',
        supportEmail: 'support@whatsapp-saas.com',
        maintenanceMode: false,
    };
    app.get('/settings', async (request, reply) => {
        return {
            success: true,
            data: platformSettings,
        };
    });
    app.patch('/settings', async (request, reply) => {
        const body = z.object({
            platformName: z.string().optional(),
            supportEmail: z.string().email().optional(),
            maintenanceMode: z.boolean().optional(),
        }).parse(request.body);
        // Persist settings in memory
        Object.assign(platformSettings, body);
        await createAuditLog(app.prisma, {
            actorId: request.authUser.id,
            actorType: 'superadmin',
            actorRole: request.authUser.role,
            action: 'UPDATE',
            resource: 'settings',
            metadata: body,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        });
        return { success: true, data: platformSettings };
    });
    // ============================================
    // SYSTEM MONITORING
    // ============================================
    app.get('/system', async (request, reply) => {
        const startTime = Date.now();
        // Get real metrics from database
        const [totalTenants, activeTenants, totalContacts, totalMessages, openTickets, totalUsers,] = await Promise.all([
            app.prisma.tenant.count(),
            app.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
            app.prisma.contact.count(),
            app.prisma.message.count(),
            app.prisma.ticket.count({ where: { status: 'OPEN' } }),
            app.prisma.user.count(),
        ]);
        const dbResponseTime = Date.now() - startTime;
        // Real WhatsApp API health check
        let waStatus = 'healthy';
        let waResponseTime = 0;
        try {
            const waStart = Date.now();
            const resp = await fetch('https://graph.facebook.com/v18.0/me', {
                method: 'GET',
                signal: AbortSignal.timeout(5000),
            });
            waResponseTime = Date.now() - waStart;
            // Even a 400/401 means Meta API is reachable
            waStatus = resp.status < 500 ? 'healthy' : 'degraded';
        }
        catch {
            waStatus = 'unreachable';
            waResponseTime = 5000;
        }
        return {
            success: true,
            data: {
                status: waStatus === 'unreachable' ? 'degraded' : 'operational',
                uptime: process.uptime(),
                responseTime: dbResponseTime,
                services: [
                    { name: 'API', status: 'healthy', responseTime: dbResponseTime + 2 },
                    { name: 'Database', status: 'healthy', responseTime: dbResponseTime },
                    { name: 'WhatsApp API', status: waStatus, responseTime: waResponseTime },
                    { name: 'Auth Service', status: 'healthy', responseTime: dbResponseTime + 1 },
                ],
                metrics: {
                    totalTenants,
                    activeTenants,
                    totalContacts,
                    totalMessages,
                    openTickets,
                    totalUsers,
                },
                resources: {
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    },
                    cpu: Math.round(process.cpuUsage().user / 1000000),
                },
            },
        };
    });
}
//# sourceMappingURL=superadmin.js.map