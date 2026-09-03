// AUTH MIDDLEWARE -- Fastify JWT + Multi-tenant Context Injection
import fp from 'fastify-plugin';
import { randomBytes } from 'crypto';
import { hasPermission } from '@whatsapp-saas/config/rbac';
// Public routes that don't require authentication
const PUBLIC_ROUTES = [
    '/health',
    '/api/ready',
    '/api/live',
    '/api/health/detailed',
    '/api/metrics',
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
    '/api/v1/whatsapp/oauth/callback',
    '/api/v1/meta/data-deletion',
    '/api/v1/meta/data-deletion-status',
    '/api/v1/meta/deauthorize',
    '/api/v1/data-deletion-instructions',
    // Campaign header media. Meta fetches these from its own servers with no
    // credentials of ours, so the files have to be readable anonymously. Names
    // are unguessable UUIDs and each file is deleted once its campaign finishes.
    // Note this covers only GETs of already-uploaded files — the upload endpoint
    // itself lives under /api/v1/uploads/ and stays authenticated.
    '/uploads/campaign-media/',
];
/**
 * Check if a route is public
 */
function isPublicRoute(url) {
    return PUBLIC_ROUTES.some((route) => url.startsWith(route));
}
/**
 * Register auth middleware with Fastify
 */
async function authMiddlewareInner(app) {
    // Add preHandler hook for authentication
    app.addHook('preHandler', async (request, reply) => {
        // Skip public routes
        if (isPublicRoute(request.url)) {
            return;
        }
        // Check for API Key authentication (X-API-Key header)
        const apiKeyHeader = request.headers['x-api-key'];
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
            }).catch(() => { });
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
            const decoded = await app.jwt.verify(token);
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
                // trialEndsAt was set at signup and never compared to anything, so every
                // trial ran indefinitely. Billing and auth routes stay reachable so an
                // expired tenant can still log in and pay rather than being locked out
                // of the only screen that would fix their situation.
                if (tenant.status === 'TRIAL' && tenant.trialEndsAt && tenant.trialEndsAt < new Date()) {
                    const url = request.url.split('?')[0];
                    const allowedWhileExpired = url.startsWith('/api/v1/billing') ||
                        url.startsWith('/api/v1/auth') ||
                        url.startsWith('/api/v1/plans') ||
                        url.startsWith('/api/v1/credits/rates');
                    if (!allowedWhileExpired) {
                        return reply.status(402).send({
                            success: false,
                            error: {
                                code: 'TRIAL_EXPIRED',
                                message: 'Your free trial has ended. Choose a plan to continue.',
                                trialEndedAt: tenant.trialEndsAt,
                            },
                        });
                    }
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
        }
        catch (err) {
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
export function requirePermission(resource, action) {
    return async (request, reply) => {
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
            const featureMap = {
                dashboard: 'analytics',
                contacts: 'analytics',
                conversations: 'analytics',
                messages: 'analytics',
                campaigns: 'analytics',
                templates: 'analytics',
                chatbot: 'chatbotBuilder',
                flows: 'chatbotBuilder',
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
    return async (request, reply) => {
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
    return async (request, reply) => {
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
export async function generateTokens(app, user) {
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
export async function createAuditLog(prisma, data) {
    try {
        await prisma.auditLog.create({
            data: {
                actorId: data.actorId,
                actorType: data.actorType,
                actorRole: data.actorRole,
                action: data.action,
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
    }
    catch (error) {
        // Don't fail the main operation if audit log fails
        console.error('Failed to create audit log:', error);
    }
}
// Wrap with fp to expose decorators to sibling plugins
export const authMiddleware = fp(authMiddlewareInner, {
    name: 'authMiddleware',
});
//# sourceMappingURL=auth.js.map