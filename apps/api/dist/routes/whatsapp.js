/**
 * WhatsApp Settings Routes - PER-TENANT CREDENTIALS
 * Each tenant configures their own WhatsApp Business API credentials
 * No need to modify server .env for each new client!
 */
import { z } from 'zod';
export async function registerWhatsAppRoutes(app) {
    // ============================================
    // GET /whatsapp/phone-numbers — List tenant's phone numbers
    // ============================================
    app.get('/whatsapp/phone-numbers', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { search, status, quality } = request.query;
        const where = { tenantId: request.authUser.tenantId };
        if (status)
            where.status = status;
        if (quality)
            where.qualityScore = quality;
        if (search) {
            where.OR = [
                { phoneNumber: { contains: search, mode: 'insensitive' } },
                { displayName: { contains: search, mode: 'insensitive' } },
            ];
        }
        const phoneNumbers = await app.prisma.phoneNumber.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: phoneNumbers };
    });
    // ============================================
    // POST /whatsapp/phone-numbers — Add a phone number with validation
    // ============================================
    app.post('/whatsapp/phone-numbers', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            phoneNumber: z.string()
                .min(10, 'Phone number too short')
                .max(20, 'Phone number too long')
                .regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format (use E.164 format: +1234567890)'),
            displayName: z.string().min(1).max(30, 'Display name must be 30 characters or less').optional(),
            metaPhoneId: z.string().optional(),
        });
        const body = schema.parse(request.body);
        // Check for duplicate phone number within tenant
        const existing = await app.prisma.phoneNumber.findFirst({
            where: { tenantId: request.authUser.tenantId, phoneNumber: body.phoneNumber },
        });
        if (existing) {
            return reply.status(409).send({
                success: false,
                error: { code: 'DUPLICATE', message: 'This phone number is already connected' },
            });
        }
        // Check phone number limit based on plan
        const tenant = await app.prisma.tenant.findUnique({
            where: { id: request.authUser.tenantId },
            include: { plan: true },
        });
        const currentCount = await app.prisma.phoneNumber.count({
            where: { tenantId: request.authUser.tenantId },
        });
        // For demo, allow up to 5 phone numbers
        const maxPhones = tenant?.plan?.tier === 'ENTERPRISE' ? 50 :
            tenant?.plan?.tier === 'BUSINESS' ? 10 :
                tenant?.plan?.tier === 'GROWTH' ? 5 : 3;
        if (currentCount >= maxPhones) {
            return reply.status(403).send({
                success: false,
                error: { code: 'LIMIT_EXCEEDED', message: `Maximum ${maxPhones} phone numbers allowed on your plan` },
            });
        }
        const phone = await app.prisma.phoneNumber.create({
            data: {
                tenantId: request.authUser.tenantId,
                phoneNumber: body.phoneNumber,
                displayName: body.displayName || null,
                metaPhoneId: body.metaPhoneId || null,
                status: body.metaPhoneId ? 'verified' : 'pending_verification',
            },
        });
        return reply.status(201).send({ success: true, data: phone });
    });
    // ============================================
    // GET /whatsapp/phone-numbers/:id — Get single phone with full details
    // ============================================
    app.get('/whatsapp/phone-numbers/:id', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        // Get usage stats for this phone
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentMessages = await app.prisma.message.count({
            where: {
                phoneNumberId: id,
                createdAt: { gte: thirtyDaysAgo },
            },
        });
        return {
            success: true,
            data: {
                ...phone,
                usageStats: {
                    messagesLast30Days: recentMessages,
                    avgDaily: Math.round(recentMessages / 30),
                },
            },
        };
    });
    // ============================================
    // PATCH /whatsapp/phone-numbers/:id — Update phone with full settings
    // ============================================
    app.patch('/whatsapp/phone-numbers/:id', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const body = z.object({
            displayName: z.string().min(1).max(30).optional(),
            metaPhoneId: z.string().optional(),
            phoneNumberId: z.string().optional(),
            accessToken: z.string().optional(),
            status: z.enum(['pending_verification', 'verified', 'suspended', 'limited']).optional(),
            timezone: z.string().optional(),
            dailySentLimit: z.number().min(100).max(10000).optional(),
            businessHours: z.object({
                enabled: z.boolean().optional(),
                monday: z.object({ start: z.string(), end: z.string() }).optional(),
                tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
                wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
                thursday: z.object({ start: z.string(), end: z.string() }).optional(),
                friday: z.object({ start: z.string(), end: z.string() }).optional(),
                saturday: z.object({ start: z.string(), end: z.string() }).optional(),
                sunday: z.object({ start: z.string(), end: z.string() }).optional(),
            }).optional(),
            awayMessage: z.string().max(500).optional(),
            greetingMessage: z.string().max(160).optional(),
            canSendMarketing: z.boolean().optional(),
            canSendUtility: z.boolean().optional(),
            canSendAuth: z.boolean().optional(),
        }).parse(request.body);
        const phone = await app.prisma.phoneNumber.updateMany({
            where: { id, tenantId: request.authUser.tenantId },
            data: body,
        });
        if (phone.count === 0) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        return { success: true, data: { message: 'Phone number updated' } };
    });
    // ============================================
    // DELETE /whatsapp/phone-numbers/:id — Remove phone number
    // ============================================
    app.delete('/whatsapp/phone-numbers/:id', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        await app.prisma.phoneNumber.deleteMany({
            where: { id, tenantId: request.authUser.tenantId },
        });
        return { success: true, data: { message: 'Phone number removed' } };
    });
    // ============================================
    // POST /whatsapp/phone-numbers/:id/refresh-quality — Refresh quality score
    // ============================================
    app.post('/whatsapp/phone-numbers/:id/refresh-quality', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        // In production, this would fetch from Meta API
        // For demo, simulate score changes
        const scores = ['GREEN', 'YELLOW', 'RED'];
        const randomScore = scores[Math.floor(Math.random() * scores.length)];
        await app.prisma.phoneNumber.update({
            where: { id },
            data: { qualityScore: randomScore },
        });
        return {
            success: true,
            data: {
                qualityScore: randomScore,
                updated: new Date().toISOString(),
            },
        };
    });
    // ============================================
    // GET /whatsapp/business-verification — Get business verification status
    // ============================================
    app.get('/whatsapp/business-verification', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const tenant = await app.prisma.tenant.findUnique({
            where: { id: request.authUser.tenantId },
            select: { metaBusinessId: true, name: true },
        });
        return {
            success: true,
            data: {
                businessVerified: !!tenant?.metaBusinessId,
                greenTickEnabled: false,
                displayNameApproved: true,
                domainVerified: true,
                taxIdVerified: false,
                businessName: tenant?.name || 'Your Business',
                taxId: null,
                steps: [
                    { id: 'business', name: 'Business Verification', status: tenant?.metaBusinessId ? 'completed' : 'pending', description: 'Verify your business with Meta' },
                    { id: 'display_name', name: 'Display Name', status: 'completed', description: 'Your display name is under review' },
                    { id: 'phone', name: 'Phone Numbers', status: 'completed', description: 'Connect at least one phone number' },
                    { id: 'template', name: 'Message Templates', status: 'pending', description: 'Submit templates for approval' },
                ],
            },
        };
    });
    // ============================================
    // PATCH /whatsapp/business-verification — Update verification info
    // ============================================
    app.patch('/whatsapp/business-verification', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const body = z.object({
            industry: z.string().optional(),
            useCase: z.string().optional(),
        }).parse(request.body);
        await app.prisma.tenant.update({
            where: { id: request.authUser.tenantId },
            data: {
                industry: body.industry,
                useCase: body.useCase,
            },
        });
        return { success: true, data: { message: 'Verification info updated' } };
    });
    // ============================================
    // GET /whatsapp/quality-report/:phoneId — Get detailed quality report
    // ============================================
    app.get('/whatsapp/quality-report/:phoneId', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { phoneId } = z.object({ phoneId: z.string() }).parse(request.params);
        const { period } = request.query;
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id: phoneId, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        // Calculate metrics based on period
        const days = period === '90' ? 90 : period === '30' ? 30 : 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        // Get message stats
        const messages = await app.prisma.message.findMany({
            where: {
                phoneNumberId: phoneId,
                createdAt: { gte: startDate },
            },
            select: {
                status: true,
                readAt: true,
                createdAt: true,
            },
        });
        const totalMessages = messages.length;
        const delivered = messages.filter(m => m.status === 'DELIVERED' || m.status === 'SENT').length;
        const read = messages.filter(m => m.readAt).length;
        // Mock historical data for trends
        const dailyTrend = Array.from({ length: days }, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (days - 1 - i));
            return {
                date: date.toISOString().split('T')[0],
                deliveryRate: 95 + Math.random() * 5,
                openRate: 70 + Math.random() * 20,
                responseRate: 30 + Math.random() * 30,
                blockRate: Math.random() * 2,
            };
        });
        return {
            success: true,
            data: {
                phoneNumber: phone.phoneNumber,
                qualityScore: phone.qualityScore || 'GREEN',
                period: `${days} days`,
                metrics: {
                    totalMessages,
                    deliveryRate: totalMessages > 0 ? Math.round((delivered / totalMessages) * 100 * 10) / 10 : 0,
                    openRate: totalMessages > 0 ? Math.round((read / totalMessages) * 100 * 10) / 10 : 0,
                    responseRate: 40 + Math.random() * 20,
                    blockRate: Math.random() * 2,
                    reportRate: Math.random() * 0.5,
                },
                dailyTrend,
                benchmark: {
                    deliveryRate: 95,
                    openRate: 75,
                    responseRate: 45,
                },
                issues: phone.qualityScore === 'RED' ? [
                    'High block rate detected in last 7 days',
                    'Consider reviewing message content',
                    'Ensure users have explicitly opted in',
                ] : phone.qualityScore === 'YELLOW' ? [
                    'Delivery rate below average',
                    'Monitor for further degradation',
                ] : [],
                recommendations: [
                    'Continue monitoring message quality',
                    'Ensure users have opted in',
                    'Send relevant, timely messages',
                    'Use message templates for consistency',
                ],
                updatedAt: new Date().toISOString(),
            },
        };
    });
    // ============================================
    // GET /whatsapp/credentials — Get THIS TENANT's WhatsApp credentials
    // ============================================
    app.get('/whatsapp/credentials', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        // Get tenant-specific credentials (per-tenant isolation)
        const creds = await app.prisma.whatsAppCredentials.findUnique({
            where: { tenantId: request.authUser.tenantId },
        });
        return {
            success: true,
            data: {
                appId: creds?.appId || '',
                wabaId: creds?.wabaId || '',
                businessAccountId: creds?.businessId || '',
                isConfigured: !!creds?.isConfigured,
                hasAppSecret: !!creds?.appSecret,
                hasAccessToken: !!creds?.accessToken,
                webhookUrl: creds?.webhookUrl || '',
                webhookEnabled: creds?.webhookEnabled || false,
                rateLimitDaily: creds?.rateLimitDaily || 1000,
                rateLimitHourly: creds?.rateLimitHourly || 250,
                lastTestedAt: creds?.lastTestedAt,
                lastError: creds?.lastError,
            },
        };
    });
    // ============================================
    // POST /whatsapp/credentials — Save THIS TENANT's WhatsApp credentials
    // Each tenant saves their own credentials - multi-tenant isolation
    // ============================================
    app.post('/whatsapp/credentials', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            appId: z.string().min(10, 'App ID required'),
            appSecret: z.string().optional(),
            accessToken: z.string().optional(),
            wabaId: z.string().optional(),
            businessAccountId: z.string().optional(),
        });
        const body = schema.parse(request.body);
        // Load existing credentials so we can keep secret/token if not re-entered
        const existing = await app.prisma.whatsAppCredentials.findUnique({
            where: { tenantId: request.authUser.tenantId },
        });
        const newSecret = body.appSecret && body.appSecret.length >= 10 ? body.appSecret : existing?.appSecret;
        const newToken = body.accessToken && body.accessToken.length >= 20 ? body.accessToken : existing?.accessToken;
        await app.prisma.whatsAppCredentials.upsert({
            where: { tenantId: request.authUser.tenantId },
            update: {
                appId: body.appId,
                appSecret: newSecret,
                accessToken: newToken,
                wabaId: body.wabaId,
                businessId: body.businessAccountId,
                isConfigured: !!(body.appId && newSecret && newToken),
                lastTestedAt: new Date(),
                lastError: null,
            },
            create: {
                tenantId: request.authUser.tenantId,
                appId: body.appId,
                appSecret: newSecret,
                accessToken: newToken,
                wabaId: body.wabaId,
                businessId: body.businessAccountId,
                isConfigured: !!(body.appId && newSecret && newToken),
                lastTestedAt: new Date(),
            },
        });
        return {
            success: true,
            data: { message: 'Credentials saved successfully' },
        };
    });
    // ============================================
    // POST /whatsapp/credentials/test — Test THIS TENANT's credentials
    // ============================================
    app.post('/whatsapp/credentials/test', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            appId: z.string().optional(),
            appSecret: z.string().optional(),
            accessToken: z.string().optional(),
        });
        const body = schema.parse(request.body || {});
        // Load tenant's credentials (per-tenant isolation)
        const creds = await app.prisma.whatsAppCredentials.findUnique({
            where: { tenantId: request.authUser.tenantId },
        });
        // Use provided credentials or stored ones
        const appId = body.appId || creds?.appId;
        const appSecret = body.appSecret || creds?.appSecret;
        const accessToken = body.accessToken || creds?.accessToken;
        const isConfigured = !!(appId && accessToken);
        // Test connection to Meta API
        let connectionValid = false;
        let apiError = null;
        if (isConfigured && accessToken && appId) {
            try {
                const response = await fetch(`https://graph.facebook.com/v18.0/${appId}?access_token=${accessToken}`);
                connectionValid = response.ok;
                if (!connectionValid) {
                    const error = await response.json().catch(() => ({}));
                    apiError = error.error?.message || 'API returned error';
                }
            }
            catch (e) {
                connectionValid = false;
                apiError = 'Network error - could not connect to Meta';
            }
        }
        // Update test result in database
        await app.prisma.whatsAppCredentials.upsert({
            where: { tenantId: request.authUser.tenantId },
            create: {
                tenantId: request.authUser.tenantId,
                appId,
                accessToken,
                isConfigured,
                lastTestedAt: new Date(),
                lastError: apiError,
            },
            update: {
                lastTestedAt: new Date(),
                lastError: apiError,
            },
        });
        return {
            success: true,
            data: {
                valid: connectionValid,
                configured: isConfigured,
                message: connectionValid ? 'Credentials are valid and connected!'
                    : (isConfigured ? 'Invalid credentials'
                        : 'Please add credentials first'),
                lastError: apiError,
                testedAt: new Date().toISOString(),
                apiVersion: 'v18.0',
            },
        };
    });
    // ============================================
    // POST /whatsapp/credentials/send-test — Send test message
    // ============================================
    app.post('/whatsapp/credentials/send-test', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            phoneNumberId: z.string(),
            testPhone: z.string().regex(/^\+?[1-9]\d{6,14}$/).optional(),
        });
        const body = schema.parse(request.body);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id: body.phoneNumberId, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        // In production, this would send via Meta API
        return {
            success: true,
            data: {
                message: 'Test message sent',
                to: body.testPhone || '+1234567890',
                messageId: `test_${Date.now()}`,
                sentAt: new Date().toISOString(),
            },
        };
    });
    // ============================================
    // GET /whatsapp/webhook-url — Get the webhook URL
    // ============================================
    app.get('/whatsapp/webhook-url', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const webhookUrl = process.env.APP_URL
            ? `${new URL(process.env.APP_URL).origin}/webhook`
            : `http://localhost:${process.env.PORT || 3001}/webhook`;
        return { success: true, data: { webhookUrl } };
    });
    // ============================================
    // GET /whatsapp/webhook/settings — Get webhook settings
    // ============================================
    app.get('/whatsapp/webhook/settings', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        // Get webhook logs
        const webhookLogs = await app.prisma.webhookLog?.findMany?.({
            where: { tenantId: request.authUser.tenantId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        }).catch(() => []) || [];
        return {
            success: true,
            data: {
                fields: {
                    messages: true,
                    message_deliveries: true,
                    message_reads: true,
                    message_reactions: true,
                    conversations: true,
                    phone_number_quality: true,
                },
                retrySettings: {
                    maxRetries: 3,
                    retryDelay: 300,
                },
                logs: webhookLogs,
            },
        };
    });
    // ============================================
    // PATCH /whatsapp/webhook/settings — Update webhook settings
    // ============================================
    app.patch('/whatsapp/webhook/settings', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const body = z.object({
            fields: z.object({
                messages: z.boolean().optional(),
                message_deliveries: z.boolean().optional(),
                message_reads: z.boolean().optional(),
                message_reactions: z.boolean().optional(),
                conversations: z.boolean().optional(),
                phone_number_quality: z.boolean().optional(),
            }).optional(),
            retrySettings: z.object({
                maxRetries: z.number().min(0).max(10).optional(),
                retryDelay: z.number().min(60).max(3600).optional(),
            }).optional(),
        }).parse(request.body);
        // In production, this would update Meta webhook subscription
        return {
            success: true,
            data: {
                message: 'Webhook settings updated',
                settings: body,
            },
        };
    });
    // ============================================
    // POST /whatsapp/webhook/test — Test webhook
    // ============================================
    app.post('/whatsapp/webhook/test', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        // In production, this would trigger a test webhook to Meta
        return {
            success: true,
            data: {
                message: 'Webhook test initiated',
                timestamp: new Date().toISOString(),
                webhookUrl: process.env.APP_URL
                    ? `${new URL(process.env.APP_URL).origin}/webhook`
                    : `http://localhost:${process.env.PORT || 3001}/webhook`,
            },
        };
    });
    // ============================================
    // POST /whatsapp/phone-numbers/bulk-import — Bulk import phone numbers
    // ============================================
    app.post('/whatsapp/phone-numbers/bulk-import', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const schema = z.object({
            phoneNumbers: z.array(z.object({
                phoneNumber: z.string().regex(/^\+?[1-9]\d{6,14}$/),
                displayName: z.string().max(30).optional(),
                metaPhoneId: z.string().optional(),
            })).min(1).max(100),
        });
        const body = schema.parse(request.body);
        // Check current count
        const currentCount = await app.prisma.phoneNumber.count({
            where: { tenantId: request.authUser.tenantId },
        });
        const maxPhones = 10; // Can be increased based on plan
        if (currentCount + body.phoneNumbers.length > maxPhones) {
            return reply.status(403).send({
                success: false,
                error: { code: 'LIMIT_EXCEEDED', message: `Import would exceed ${maxPhones} phone limit` },
            });
        }
        const results = { created: 0, skipped: 0, errors: [] };
        for (const phone of body.phoneNumbers) {
            try {
                const existing = await app.prisma.phoneNumber.findFirst({
                    where: { tenantId: request.authUser.tenantId, phoneNumber: phone.phoneNumber },
                });
                if (existing) {
                    results.skipped++;
                    continue;
                }
                await app.prisma.phoneNumber.create({
                    data: {
                        tenantId: request.authUser.tenantId,
                        phoneNumber: phone.phoneNumber,
                        displayName: phone.displayName || null,
                        metaPhoneId: phone.metaPhoneId || null,
                        status: phone.metaPhoneId ? 'verified' : 'pending_verification',
                    },
                });
                results.created++;
            }
            catch (err) {
                results.errors.push(`${phone.phoneNumber}: Import failed`);
            }
        }
        return {
            success: true,
            data: {
                message: `Import complete: ${results.created} created, ${results.skipped} skipped`,
                ...results,
            },
        };
    });
    // ============================================
    // GET /whatsapp/rate-limits — Get rate limit status
    // ============================================
    app.get('/whatsapp/rate-limits', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const phoneNumbers = await app.prisma.phoneNumber.findMany({
            where: { tenantId: request.authUser.tenantId },
            select: {
                id: true,
                phoneNumber: true,
                dailySentLimit: true,
                todaySentCount: true,
                lastResetAt: true,
            },
        });
        return {
            success: true,
            data: {
                global: {
                    messagesPerMinute: 250,
                    messagesPerHour: 5000,
                    messagesPerDay: 100000,
                },
                phones: phoneNumbers.map(p => ({
                    ...p,
                    resetAt: p.lastResetAt ? new Date(new Date(p.lastResetAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
                })),
            },
        };
    });
    // ============================================
    // GET /whatsapp/template-usage/:phoneId — Get template usage stats
    // ============================================
    app.get('/whatsapp/template-usage/:phoneId', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { phoneId } = z.object({ phoneId: z.string() }).parse(request.params);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id: phoneId, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND' } });
        }
        // Get template usage from messages
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const messages = await app.prisma.message.groupBy({
            by: ['templateId'],
            where: {
                phoneNumberId: phoneId,
                templateId: { not: null },
                createdAt: { gte: thirtyDaysAgo },
            },
            _count: true,
        });
        return {
            success: true,
            data: {
                phoneNumber: phone.phoneNumber,
                totalTemplatesUsed: messages.length,
                topTemplates: messages.slice(0, 10).map(m => ({
                    templateId: m.templateId,
                    usageCount: m._count,
                })),
                period: '30 days',
            },
        };
    });
    // ============================================
    // GET /whatsapp/phone-numbers/:id/details — Get phone number details
    // ============================================
    app.get('/whatsapp/phone-numbers/:id/details', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id, tenantId: request.authUser.tenantId },
            include: {
                _count: { select: { messages: true, conversations: true } },
            },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
        }
        return {
            success: true,
            data: {
                ...phone,
                totalMessages: phone._count.messages,
                totalConversations: phone._count.conversations,
            },
        };
    });
    // ============================================
    // PATCH /whatsapp/phone-numbers/:id/settings — Update phone settings
    // ============================================
    app.patch('/whatsapp/phone-numbers/:id/settings', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const body = z.object({
            timezone: z.string().optional(),
            dailySentLimit: z.number().optional(),
            autoReplyEnabled: z.boolean().optional(),
            autoReplyMessage: z.string().optional(),
            businessHoursEnabled: z.boolean().optional(),
            businessHours: z.object({
                monday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
                tuesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
                wednesday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
                thursday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
                friday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
                saturday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
                sunday: z.object({ start: z.string(), end: z.string(), enabled: z.boolean() }).optional(),
            }).optional(),
        }).parse(request.body);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
        }
        const updateData = {};
        if (body.timezone !== undefined)
            updateData.timezone = body.timezone;
        if (body.dailySentLimit !== undefined)
            updateData.dailySentLimit = body.dailySentLimit;
        if (body.businessHours !== undefined)
            updateData.businessHours = body.businessHours;
        const updated = await app.prisma.phoneNumber.update({
            where: { id },
            data: updateData,
        });
        return { success: true, data: updated };
    });
    // ============================================
    // POST /whatsapp/phone-numbers/:id/quick-replies — Create quick reply
    // ============================================
    app.post('/whatsapp/phone-numbers/:id/quick-replies', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const body = z.object({
            keyword: z.string().min(1).max(50),
            message: z.string().min(1).max(500),
        }).parse(request.body);
        const phone = await app.prisma.phoneNumber.findFirst({
            where: { id, tenantId: request.authUser.tenantId },
        });
        if (!phone) {
            return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Phone number not found' } });
        }
        const quickReply = await app.prisma.quickReply.create({
            data: {
                tenantId: request.authUser.tenantId,
                phoneNumberId: id,
                keyword: body.keyword,
                message: body.message,
                isActive: true,
            },
        });
        return { success: true, data: quickReply };
    });
    // ============================================
    // GET /whatsapp/phone-numbers/:id/quick-replies — List quick replies
    // ============================================
    app.get('/whatsapp/phone-numbers/:id/quick-replies', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id } = z.object({ id: z.string() }).parse(request.params);
        const quickReplies = await app.prisma.quickReply.findMany({
            where: { phoneNumberId: id, tenantId: request.authUser.tenantId },
            orderBy: { createdAt: 'desc' },
        });
        return { success: true, data: quickReplies };
    });
    // ============================================
    // DELETE /whatsapp/phone-numbers/:id/quick-replies/:qrId — Delete quick reply
    // ============================================
    app.delete('/whatsapp/phone-numbers/:id/quick-replies/:qrId', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { id, qrId } = z.object({ id: z.string(), qrId: z.string() }).parse(request.params);
        await app.prisma.quickReply.deleteMany({
            where: { id: qrId, phoneNumberId: id, tenantId: request.authUser.tenantId },
        });
        return { success: true, data: { deleted: true } };
    });
    // ============================================
    // GET /whatsapp/quality/history — Get quality history
    // ============================================
    app.get('/whatsapp/quality/history', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { days } = z.object({
            days: z.string().optional().transform(v => parseInt(v || '30')),
        }).parse(request.query);
        // Generate mock historical data
        const history = [];
        const now = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            history.push({
                date: date.toISOString().split('T')[0],
                score: Math.random() > 0.3 ? 'GREEN' : (Math.random() > 0.5 ? 'YELLOW' : 'RED'),
                messagesSent: Math.floor(Math.random() * 500),
                deliveryRate: 90 + Math.random() * 10,
                responseRate: 30 + Math.random() * 40,
            });
        }
        return { success: true, data: history };
    });
    // ============================================
    // GET /whatsapp/quality-report — Get overall quality report (all phones)
    // ============================================
    app.get('/whatsapp/quality-report', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        // Get phone numbers
        const phones = await app.prisma.phoneNumber.findMany({
            where: { tenantId: request.authUser.tenantId },
        });
        // Calculate quality stats
        const greenPhones = phones.filter(p => p.qualityScore === 'GREEN').length;
        const yellowPhones = phones.filter(p => p.qualityScore === 'YELLOW').length;
        const redPhones = phones.filter(p => p.qualityScore === 'RED').length;
        const overall = {
            totalPhones: phones.length,
            greenPhones,
            yellowPhones,
            redPhones,
            averageQuality: phones.length > 0
                ? ((greenPhones / phones.length) * 100).toFixed(1)
                : '100',
            lastUpdated: new Date().toISOString(),
        };
        // Return phones without complex selects
        const phoneData = phones.map(p => ({
            id: p.id,
            phoneNumber: p.phoneNumber,
            displayName: p.displayName,
            qualityScore: p.qualityScore,
            status: p.status,
        }));
        return { success: true, data: { overall, phones: phoneData } };
    });
    // ============================================
    // GET /whatsapp/phone-numbers/search — Search phone numbers
    // ============================================
    app.get('/whatsapp/phone-numbers/search', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const { query } = z.object({
            query: z.string().optional(),
        }).parse(request.query);
        const phones = await app.prisma.phoneNumber.findMany({
            where: {
                tenantId: request.authUser.tenantId,
                OR: query ? [
                    { phoneNumber: { contains: query } },
                    { displayName: { contains: query } },
                ] : undefined,
            },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        return { success: true, data: phones };
    });
    // ============================================
    // GET /whatsapp/phone-numbers/export — Export phone numbers
    // ============================================
    app.get('/whatsapp/phone-numbers/export', async (request, reply) => {
        if (!request.authUser.tenantId) {
            return reply.status(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
        }
        const phones = await app.prisma.phoneNumber.findMany({
            where: { tenantId: request.authUser.tenantId },
            select: {
                phoneNumber: true,
                displayName: true,
                status: true,
                qualityScore: true,
                createdAt: true,
            },
        });
        // Generate CSV
        const csv = [
            'Phone Number,Display Name,Status,Quality Score,Created At',
            ...phones.map(p => `${p.phoneNumber},${p.displayName || ''},${p.status},${p.qualityScore || 'N/A'},${p.createdAt.toISOString()}`),
        ].join('\n');
        return {
            success: true,
            data: {
                csv,
                count: phones.length,
            },
        };
    });
}
//# sourceMappingURL=whatsapp.js.map