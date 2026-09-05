// Fastify Application Setup

import Fastify, { FastifyInstance } from 'fastify';
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
import { registerRazorpayWebhook } from './routes/razorpay-webhook.js';
import { registerAddOnRoutes } from './routes/tenant-addons.js';
import { registerInvoiceRoutes } from './routes/invoice.js';
import { registerWhatsAppRoutes } from './routes/whatsapp.js';
import { registerCreditRoutes } from './routes/credits.js';
import { registerSuperadminCreditRoutes } from './routes/superadminCredits.js';
import { registerSuperadminCommerceRoutes } from './routes/superadminCommerce.js';
import { registerFileRoutes, registerStorageAdminRoutes } from './routes/files.js';
import { registerSSERoutes } from './routes/sse.js';
import { registerAutomationRoutes } from './routes/automation.js';
import { registerTeamRoutes } from './routes/teams.js';
import { registerInsightsRoutes } from './routes/analytics.js';
import { registerSystemRoutes } from './routes/monitoring.js';
import { registerMetaComplianceRoutes } from './routes/metaCompliance.js';
import { registerAIRoutes } from './routes/ai.js';
import { registerKnowledgeBaseRoutes } from './routes/knowledgeBase.js';
import { registerUploadRoutes, campaignMediaDir } from './routes/uploads.js';

// Extend Fastify instance with custom properties
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requirePermission: (resource: string, action: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireOwner: () => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
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
    routes: ['/api/v1/stripe/webhook', '/webhooks/razorpay'],
  });

  /**
   * A POST with no body but a JSON content-type.
   *
   * Several endpoints take no body at all — submit a template, sync, verify a
   * number. axios still sets Content-Type: application/json on a bodyless
   * post, and Fastify's default parser rejects that combination outright with
   * FST_ERR_CTP_EMPTY_JSON_BODY. The button in the UI just showed "400".
   *
   * Treating an empty body as {} is what those routes already expect, and their
   * zod schemas still reject a body that is present but malformed.
   */
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = (body as string) ?? '';
    if (text.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(text));
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // Meta calls the Data Deletion callback as application/x-www-form-urlencoded
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Register auth middleware
  await app.register(authMiddleware);

  // Decorate with RBAC guards (must run after authMiddleware sets request.authUser)
  app.decorate('requirePermission', (resource: string, action: string) =>
    requirePermission(resource as any, action as any)
  );
  app.decorate('requireOwner', () => requireOwner());

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Global error handler.
  //
  // Must be set BEFORE the route plugins below. Fastify encapsulates on
  // register(), so a handler installed afterwards never applies to routes
  // already registered — which is where this used to sit, meaning it had no
  // effect on any endpoint and every failure fell back to Fastify's default
  // body instead of this API's { success, error } envelope.
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

    // Routes validate with zod's .parse(), which throws a ZodError rather than
    // setting Fastify's `validation` property. Matched by shape rather than
    // instanceof, so it holds across duplicate zod copies in the dependency tree.
    const issues = (error as any)?.issues;
    if (Array.isArray(issues) && issues.length > 0 && issues[0]?.code) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: issues
            .map((i: any) => {
              const field = Array.isArray(i.path) && i.path.length ? i.path.join('.') : 'value';
              return `${field}: ${i.message}`;
            })
            .join('; '),
          details: issues,
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
  await app.register(registerSuperadminCommerceRoutes, { prefix: '/api/v1/superadmin' });
  await app.register(registerStorageAdminRoutes, { prefix: '/api/v1/superadmin' });
  await app.register(registerFileRoutes, { prefix: '/api/v1' });
  const { registerSuperadminAdvancedRoutes } = await import('./routes/superadminFeatures.js');
  await app.register(registerSuperadminAdvancedRoutes, { prefix: '/api/v1/superadmin' });
  await app.register(registerWebhookRoutes);
  await app.register(registerStripeWebhook);
  await app.register(registerRazorpayWebhook);
  await app.register(registerSSERoutes, { prefix: '/api/v1' });
  await app.register(registerAutomationRoutes, { prefix: '/api/v1' });
  await app.register(registerTeamRoutes, { prefix: '/api/v1' });
  await app.register(registerInsightsRoutes, { prefix: '/api/v1' });
  await app.register(registerSystemRoutes);
  await app.register(registerMetaComplianceRoutes, { prefix: '/api/v1' });
  await app.register(registerAIRoutes, { prefix: '/api/v1' });
  await app.register(registerKnowledgeBaseRoutes, { prefix: '/api/v1' });
  await app.register(registerUploadRoutes, { prefix: '/api/v1' });

  // Cleanup on shutdown
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  return app;
}

export type { FastifyInstance };
