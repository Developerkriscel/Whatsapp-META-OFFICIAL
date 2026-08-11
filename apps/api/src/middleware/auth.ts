// AUTH MIDDLEWARE -- Fastify JWT + Multi-tenant Context Injection

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { randomBytes } from 'crypto';
import { hasPermission, type Resource, type Action } from '@whatsapp-saas/config/rbac';

// Define auth user type
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  tenantId?: string;
  superadminId?: string;
  isSuperadmin: boolean;
}

export interface TenantContext {
  id: string;
  name: string;
  status: string;
  plan?: {
    id: string;
    name: string;
    limits: Record<string, number>;
    features: Record<string, boolean>;
  };
}

// Extend request type
declare module 'fastify' {
  interface FastifyRequest {
    authUser: AuthUser;
    tenantContext?: TenantContext;
  }
}

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/health',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/refresh',
  '/api/v1/plans',
  '/api/v1/credits/rates',
  '/api/v1/credits/rates/:countryCode',
  '/api/v1/credits/currencies',
  '/webhook',
  '/api/v1/webhooks/whatsapp',
  '/api/v1/stripe/webhook',
];

/**
 * Check if a route is public
 */
function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((route) => url.startsWith(route));
}

/**
 * Register auth middleware with Fastify
 */
async function authMiddlewareInner(app: FastifyInstance): Promise<void> {
  // Add preHandler hook for authentication
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip public routes
    if (isPublicRoute(request.url)) {
      return;
    }

    // Check for API Key authentication (X-API-Key header)
    const apiKeyHeader = request.headers['x-api-key'] as string | undefined;
    if (apiKeyHeader) {
      const keyHash = apiKeyHeader.slice(0, 8);
      const keyDoc = await app.prisma.apiKey.findFirst({
        where: { keyHash },
        include: { tenant: true, user: true },
      });

      if (!keyDoc || !keyDoc.isActive || keyDoc.tenant.status === 'SUSPENDED') {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
        });
      }

      // Update last used timestamp (fire and forget)
      app.prisma.apiKey.update({
        where: { id: keyDoc.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});

      request.authUser = {
        id: keyDoc.userId || keyDoc.id,
        email: keyDoc.user?.email || 'api@system',
        role: 'API_USER',
        tenantId: keyDoc.tenantId,
        superadminId: undefined,
        isSuperadmin: false,
      };

      request.tenantContext = {
        id: keyDoc.tenant.id,
        name: keyDoc.tenant.name,
        status: keyDoc.tenant.status,
      };

      return;
    }

    // Extract token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    const token = authHeader.substring(7);

    try {
      // Verify JWT token
      const decoded = await app.jwt.verify<{
        sub: string;
        email: string;
        role: string;
        tenantId?: string;
        superadminId?: string;
        isSuperadmin: boolean;
      }>(token);

      // Set user on request
      request.authUser = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        tenantId: decoded.tenantId,
        superadminId: decoded.superadminId,
        isSuperadmin: decoded.isSuperadmin,
      };

      // Load tenant context for tenant users
      if (decoded.tenantId && !decoded.isSuperadmin) {
        const tenant = await app.prisma.tenant.findUnique({
          where: { id: decoded.tenantId },
          include: {
            plan: {
              select: {
                id: true,
                name: true,
                maxContacts: true,
                maxMessagesPerMonth: true,
                maxTeamMembers: true,
                maxChatbotFlows: true,
                maxCampaigns: true,
                maxSegments: true,
                maxTemplates: true,
                maxAPIKeys: true,
                maxMessagesPerMinute: true,
                hasAnalytics: true,
                hasChatbotBuilder: true,
                hasWhatsAppFlows: true,
                hasAPI: true,
                hasAIChatbot: true,
                hasCustomBranding: true,
                hasPrioritySupport: true,
                hasAdvancedAnalytics: true,
                hasWhiteLabel: true,
                hasDripCampaigns: true,
                hasABTesting: true,
              },
            },
          },
        });

        if (!tenant) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'TENANT_NOT_FOUND',
              message: 'Tenant not found',
            },
          });
        }

        if (tenant.status === 'SUSPENDED') {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'TENANT_SUSPENDED',
              message: 'Your workspace is suspended. Please contact support.',
            },
          });
        }

        request.tenantContext = {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          plan: tenant.plan
            ? {
                id: tenant.plan.id,
                name: tenant.plan.name,
                limits: {
                  maxContacts: tenant.plan.maxContacts,
                  maxMessagesPerMonth: tenant.plan.maxMessagesPerMonth,
                  maxTeamMembers: tenant.plan.maxTeamMembers,
                  maxChatbotFlows: tenant.plan.maxChatbotFlows,
                  maxCampaigns: tenant.plan.maxCampaigns,
                  maxSegments: tenant.plan.maxSegments,
                  maxTemplates: tenant.plan.maxTemplates,
                  maxAPIKeys: tenant.plan.maxAPIKeys,
                  maxMessagesPerMinute: tenant.plan.maxMessagesPerMinute,
                },
                features: {
                  analytics: tenant.plan.hasAnalytics,
                  chatbotBuilder: tenant.plan.hasChatbotBuilder,
                  whatsappFlows: tenant.plan.hasWhatsAppFlows,
                  apiAccess: tenant.plan.hasAPI,
                  aiChatbot: tenant.plan.hasAIChatbot,
                  customBranding: tenant.plan.hasCustomBranding,
                  prioritySupport: tenant.plan.hasPrioritySupport,
                  advancedAnalytics: tenant.plan.hasAdvancedAnalytics,
                  whiteLabel: tenant.plan.hasWhiteLabel,
                  dripCampaigns: tenant.plan.hasDripCampaigns,
                  abTesting: tenant.plan.hasABTesting,
                },
              }
            : undefined,
        };
      }
    } catch (err: any) {
      if (err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
        return reply.status(401).send({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Access token has expired. Please refresh.',
          },
        });
      }
      return reply.status(401).send({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token',
        },
      });
    }
  });
}

/**
 * RBAC Guard: requirePermission('contacts', 'create')
 */
export function requirePermission(resource: Resource, action: Action) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Superadmin bypasses all RBAC checks
    if (request.authUser?.isSuperadmin) {
      return;
    }

    if (!request.authUser) {
      return reply.status(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
    }

    // Check permission
    if (!hasPermission(request.authUser.role, resource, action)) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `You don't have permission to ${action} ${resource}`,
          required: { resource, action },
        },
      });
    }

    // Check plan feature access
    if (request.tenantContext?.plan) {
      const featureMap: Record<Resource, string> = {
        dashboard: 'analytics',
        contacts: 'analytics',
        conversations: 'analytics',
        messages: 'analytics',
        campaigns: 'analytics',
        templates: 'analytics',
        chatbot: 'chatbotBuilder',
        flows: 'whatsAppFlows',
        phone_numbers: 'analytics',
        analytics: 'analytics',
        team: 'analytics',
        settings: 'analytics',
        billing: 'analytics',
        api_keys: 'apiAccess',
        segments: 'analytics',
        tickets: 'analytics',
        audit_logs: 'analytics',
        plans: '',
        tenants: '',
        support_tickets: '',
        system_settings: '',
        templates_management: '',
      };

      const feature = featureMap[resource];
      if (feature && !request.tenantContext.plan.features[feature]) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'PLAN_FEATURE_REQUIRED',
            message: `Your plan doesn't include ${resource}. Please upgrade.`,
            upgradeRequired: true,
          },
        });
      }
    }
  };
}

/**
 * RequireOwner: Only workspace owner can access
 */
export function requireOwner() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.authUser?.isSuperadmin) {
      return;
    }

    if (request.authUser?.role !== 'OWNER') {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Only workspace owner can perform this action',
        },
      });
    }
  };
}

/**
 * RequireSuperadmin: Only superadmin can access
 */
export function requireSuperadmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.authUser?.isSuperadmin) {
      return reply.status(403).send({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Superadmin access required',
        },
      });
    }
  };
}

/**
 * Generate access and refresh tokens
 */
export async function generateTokens(
  app: FastifyInstance,
  user: {
    id: string;
    email: string;
    role: string;
    tenantId?: string;
    superadminId?: string;
    isSuperadmin: boolean;
  }
) {
  const accessToken = app.jwt.sign({
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    superadminId: user.superadminId,
    isSuperadmin: user.isSuperadmin,
  });

  // Generate refresh token
  const refreshToken = randomBytes(64).toString('hex');

  return {
    accessToken,
    refreshToken,
    expiresIn: '15m',
    tokenType: 'Bearer',
  };
}

/**
 * Create audit log entry
 */
export async function createAuditLog(
  prisma: any,
  data: {
    actorId: string;
    actorType: 'user' | 'superadmin' | 'system';
    actorRole?: string;
    action: string;
    resource: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    tenantId?: string;
    userId?: string;
    superadminId?: string;
  }
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        actorType: data.actorType,
        actorRole: data.actorRole,
        action: data.action as any,
        resource: data.resource,
        resourceId: data.resourceId,
        metadata: data.metadata || {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        tenantId: data.tenantId,
        userId: data.userId,
        superadminId: data.superadminId,
      },
    });
  } catch (error) {
    // Don't fail the main operation if audit log fails
    console.error('Failed to create audit log:', error);
  }
}

// Wrap with fp to expose decorators to sibling plugins
export const authMiddleware = fp(authMiddlewareInner, {
  name: 'authMiddleware',
});
