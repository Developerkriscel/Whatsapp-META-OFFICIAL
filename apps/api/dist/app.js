// Fastify Application Setup
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rawBody from 'fastify-raw-body';
import { PrismaClient } from '@prisma/client';
import { authMiddleware, requirePermission, requireOwner } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { securityMiddleware } from './middleware/security.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerTenantRoutes } from './routes/tenant.js';
import { registerSuperadminRoutes } from './routes/superadmin.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerStripeWebhook } from './routes/stripe-webhook.js';
import { registerAddOnRoutes } from './routes/tenant-addons.js';
import { registerInvoiceRoutes } from './routes/invoice.js';
import { registerWhatsAppRoutes } from './routes/whatsapp.js';
import { registerCreditRoutes } from './routes/credits.js';
import { registerSuperadminCreditRoutes } from './routes/superadminCredits.js';
import { registerSSERoutes } from './routes/sse.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerInsightsRoutes } from './routes/analytics.js';
import { registerSystemRoutes } from './routes/monitoring.js';
import { registerMetaComplianceRoutes } from './routes/metaCompliance.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerKnowledgeBaseRoutes } from './routes/knowledgeBase.js';
import { registerUploadRoutes, campaignMediaDir } from './routes/uploads.js';
export async function buildApp() {
    const app = Fastify({
        logger: {
            level: process.env.LOG_LEVEL || 'info',
        },
    });
    // Initialize Prisma
    const prisma = new PrismaClient();
    app.decorate('prisma', prisma);
    // Register CORS
    await app.register(cors, {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true,
    });
    // Campaign header media uploads. The per-file ceiling is Meta's largest
    // (100MB, documents); the upload route enforces the tighter per-type limits.
    await app.register(multipart, {
        limits: { fileSize: 100 * 1024 * 1024, files: 1 },
    });
    // Meta fetches header media over plain HTTP from its own servers, so uploaded
    // files are served unauthenticated. Names are random UUIDs and the files are
    // deleted once their campaign finishes, which keeps the exposure window short.
    await app.register(fastifyStatic, {
        root: campaignMediaDir(),
        prefix: '/uploads/campaign-media/',
        decorateReply: false,
    });
    // Register cookie support (httpOnly refresh token cookie)
    await app.register(cookie, {
        secret: process.env.JWT_SECRET || 'fallback-secret-for-development',
    });
    // Register JWT
    await app.register(jwt, {
        secret: process.env.JWT_SECRET || 'fallback-secret-for-development',
        sign: {
            expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        },
    });
    // Register rate limiting
    await app.register(rateLimitMiddleware);
    // Register security middleware (XSS, SQL injection, headers)
    await app.register(securityMiddleware);
    // Register raw-body plugin for Stripe webhook signature verification
    await app.register(rawBody, {
        field: 'rawBody',
        global: false,
        routes: ['/api/v1/stripe/webhook'],
    });
    // Meta calls the Data Deletion callback as application/x-www-form-urlencoded
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
        try {
            done(null, Object.fromEntries(new URLSearchParams(body)));
        }
        catch (err) {
            done(err, undefined);
        }
    });
    // Register auth middleware
    await app.register(authMiddleware);
    // Decorate with RBAC guards (must run after authMiddleware sets request.authUser)
    app.decorate('requirePermission', (resource, action) => requirePermission(resource, action));
    app.decorate('requireOwner', () => requireOwner());
    // Health check
    app.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
    // Register routes
    await app.register(registerAuthRoutes, { prefix: '/api/v1/auth' });
    await app.register(registerTenantRoutes, { prefix: '/api/v1' });
    await app.register(registerSuperadminRoutes, { prefix: '/api/v1/superadmin' });
    await app.register(registerBillingRoutes, { prefix: '/api/v1' });
    await app.register(registerAddOnRoutes, { prefix: '/api/v1' });
    await app.register(registerWhatsAppRoutes, { prefix: '/api/v1' });
    await app.register(registerInvoiceRoutes, { prefix: '/api/v1' });
    await app.register(registerCreditRoutes, { prefix: '/api/v1' });
    await app.register(registerSuperadminCreditRoutes, { prefix: '/api/v1/superadmin' });
    const { registerSuperadminAdvancedRoutes } = await import('./routes/superadminFeatures.js');
    await app.register(registerSuperadminAdvancedRoutes, { prefix: '/api/v1/superadmin' });
    await app.register(registerWebhookRoutes);
    await app.register(registerStripeWebhook);
    await app.register(registerSSERoutes, { prefix: '/api/v1' });
    await app.register(registerAutomationRoutes, { prefix: '/api/v1' });
    await app.register(registerTeamRoutes, { prefix: '/api/v1' });
    await app.register(registerInsightsRoutes, { prefix: '/api/v1' });
    await app.register(registerSystemRoutes);
    await app.register(registerMetaComplianceRoutes, { prefix: '/api/v1' });
    await app.register(registerAIRoutes, { prefix: '/api/v1' });
    await app.register(registerKnowledgeBaseRoutes, { prefix: '/api/v1' });
    await app.register(registerUploadRoutes, { prefix: '/api/v1' });
    // Global error handler
    app.setErrorHandler((error, request, reply) => {
        app.log.error(error);
        if (error.validation) {
            return reply.status(400).send({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Validation failed',
                    details: error.validation,
                },
            });
        }
        if (error.statusCode) {
            return reply.status(error.statusCode).send({
                success: false,
                error: {
                    code: error.code || 'ERROR',
                    message: error.message,
                },
            });
        }
        return reply.status(500).send({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'An unexpected error occurred',
            },
        });
    });
    // Cleanup on shutdown
    app.addHook('onClose', async () => {
        await prisma.$disconnect();
    });
    return app;
}
//# sourceMappingURL=app.js.map