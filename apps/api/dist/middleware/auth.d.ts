import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { type Resource, type Action } from '@whatsapp-saas/config/rbac';
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
declare module 'fastify' {
    interface FastifyRequest {
        authUser: AuthUser;
        tenantContext?: TenantContext;
    }
}
/**
 * Register auth middleware with Fastify
 */
declare function authMiddlewareInner(app: FastifyInstance): Promise<void>;
/**
 * RBAC Guard: requirePermission('contacts', 'create')
 */
export declare function requirePermission(resource: Resource, action: Action): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * RequireOwner: Only workspace owner can access
 */
export declare function requireOwner(): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * RequireSuperadmin: Only superadmin can access
 */
export declare function requireSuperadmin(): (request: FastifyRequest, reply: FastifyReply) => Promise<undefined>;
/**
 * Generate access and refresh tokens
 */
export declare function generateTokens(app: FastifyInstance, user: {
    id: string;
    email: string;
    role: string;
    tenantId?: string;
    superadminId?: string;
    isSuperadmin: boolean;
}): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
    tokenType: string;
}>;
/**
 * Create audit log entry
 */
export declare function createAuditLog(prisma: any, data: {
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
}): Promise<void>;
export declare const authMiddleware: typeof authMiddlewareInner;
export {};
//# sourceMappingURL=auth.d.ts.map