import { FastifyInstance } from 'fastify';
export declare const RATE_LIMITS: {
    messages_send: {
        windowMs: number;
        maxRequests: number;
        keyPrefix: string;
    };
    api_default: {
        windowMs: number;
        maxRequests: number;
        keyPrefix: string;
    };
    auth: {
        windowMs: number;
        maxRequests: number;
        keyPrefix: string;
    };
    contacts: {
        windowMs: number;
        maxRequests: number;
        keyPrefix: string;
    };
    campaigns: {
        windowMs: number;
        maxRequests: number;
        keyPrefix: string;
    };
    login: {
        windowMs: number;
        maxRequests: number;
        keyPrefix: string;
    };
};
export declare const PLAN_MESSAGE_LIMITS: Record<string, number>;
/**
 * Register rate limit middleware
 */
export declare function rateLimitMiddleware(app: FastifyInstance): Promise<void>;
/**
 * Get rate limit for messages based on plan
 */
export declare function getMessageRateLimit(planTier: string | undefined): {
    maxRequests: number;
    windowMs: number;
};
/**
 * Get monthly message limit based on plan
 */
export declare function getMonthlyMessageLimit(planTier: string | undefined): number;
/**
 * Token Bucket Rate Limiter class
 */
export declare class TokenBucketRateLimiter {
    private maxTokens;
    private refillRate;
    private windowMs;
    private tokens;
    constructor(maxTokens: number, refillRate: number, // tokens per second
    windowMs: number);
    /**
     * Try to consume a token
     */
    check(key: string): Promise<{
        allowed: boolean;
        remaining: number;
        resetAt: number;
        retryAfterMs?: number;
    }>;
    /**
     * Reset a key
     */
    reset(key: string): void;
    /**
     * Get current bucket state
     */
    getState(key: string): {
        count: number;
        resetAt: number;
    } | null;
}
/**
 * WhatsApp Send Rate Limiter
 * Respects Meta limits + plan tiers
 */
export declare class WhatsAppSendRateLimiter {
    private mockMode;
    private buckets;
    constructor(mockMode?: boolean);
    /**
     * Get plan allowance (messages per minute)
     */
    private getPlanAllowance;
    /**
     * Check if a message can be sent
     */
    canSend(tenantId: string, planTier: string): Promise<{
        allowed: boolean;
        waitMs?: number;
        remaining?: number;
    }>;
    /**
     * Get current rate limit status
     */
    getStatus(tenantId: string, planTier: string): {
        remaining: number;
        allowance: number;
    };
}
/**
 * Create per-tenant rate limiter
 */
export declare function createTenantRateLimiter(planTier: string): TokenBucketRateLimiter;
/**
 * Get rate limiter for a specific limit type
 */
export declare function getRateLimiter(type: keyof typeof RATE_LIMITS): TokenBucketRateLimiter;
//# sourceMappingURL=rate-limit.d.ts.map