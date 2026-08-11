// Fastify Application Setup

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
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

  // Register auth middleware
  await app.register(authMiddleware);

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

export type { FastifyInstance };
