// RATE LIMITER -- Token Bucket Algorithm backed by Redis
// Per-tenant quotas with plan-based multipliers
// Rate limit configurations
export const RATE_LIMITS = {
    messages_send: {
        windowMs: 60 * 1000,
        maxRequests: 50,
        keyPrefix: 'ratelimit:msg',
    },
    api_default: {
        windowMs: 60 * 1000,
        maxRequests: 100,
        keyPrefix: 'ratelimit:api',
    },
    auth: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 10,
        keyPrefix: 'ratelimit:auth',
    },
    contacts: {
        windowMs: 60 * 1000,
        maxRequests: 60,
        keyPrefix: 'ratelimit:contacts',
    },
    campaigns: {
        windowMs: 60 * 1000,
        maxRequests: 20,
        keyPrefix: 'ratelimit:campaigns',
    },
    login: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 5,
        keyPrefix: 'ratelimit:login',
    },
};
// Plan-based allowances (messages per minute)
const PLAN_ALLOWANCES = {
    STARTER: 10,
    GROWTH: 50,
    BUSINESS: 200,
    ENTERPRISE: 1000,
};
export const PLAN_MESSAGE_LIMITS = {
    STARTER: 5000,
    GROWTH: 25000,
    BUSINESS: 100000,
    ENTERPRISE: -1, // Unlimited
};
/**
 * Register rate limit middleware
 */
export async function rateLimitMiddleware(app) {
    // Register Fastify rate limit
    await app.register(import('@fastify/rate-limit'), {
        global: true,
        max: 100,
        timeWindow: '1 minute',
        errorResponseBuilder: (request, context) => {
            return {
                success: false,
                error: {
                    code: 'RATE_LIMITED',
                    message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
                    retryAfter: Math.ceil(context.ttl / 1000),
                },
            };
        },
        keyGenerator: (request) => {
            // Use authUser ID if authenticated, otherwise use IP
            const req = request;
            if (req.authUser?.id) {
                return `user:${req.authUser.id}`;
            }
            return `ip:${request.ip}`;
        },
    });
}
/**
 * Get rate limit for messages based on plan
 */
export function getMessageRateLimit(planTier) {
    const allowance = PLAN_ALLOWANCES[planTier || 'STARTER'] || 10;
    return {
        maxRequests: allowance,
        windowMs: 60 * 1000, // 1 minute
    };
}
/**
 * Get monthly message limit based on plan
 */
export function getMonthlyMessageLimit(planTier) {
    return PLAN_MESSAGE_LIMITS[planTier || 'STARTER'] || 5000;
}
/**
 * Token Bucket Rate Limiter class
 */
export class TokenBucketRateLimiter {
    maxTokens;
    refillRate;
    windowMs;
    tokens = new Map();
    constructor(maxTokens, refillRate, // tokens per second
    windowMs) {
        this.maxTokens = maxTokens;
        this.refillRate = refillRate;
        this.windowMs = windowMs;
    }
    /**
     * Try to consume a token
     */
    async check(key) {
        const now = Date.now();
        const bucket = this.tokens.get(key);
        if (!bucket || now >= bucket.resetTime) {
            // Create new bucket
            const resetTime = now + this.windowMs;
            this.tokens.set(key, {
                count: this.maxTokens - 1,
                resetTime,
            });
            return {
                allowed: true,
                remaining: this.maxTokens - 1,
                resetAt: resetTime,
            };
        }
        if (bucket.count <= 0) {
            const retryAfterMs = bucket.resetTime - now;
            return {
                allowed: false,
                remaining: 0,
                resetAt: bucket.resetTime,
                retryAfterMs,
            };
        }
        bucket.count--;
        return {
            allowed: true,
            remaining: bucket.count,
            resetAt: bucket.resetTime,
        };
    }
    /**
     * Reset a key
     */
    reset(key) {
        this.tokens.delete(key);
    }
    /**
     * Get current bucket state
     */
    getState(key) {
        const bucket = this.tokens.get(key);
        if (!bucket)
            return null;
        return { count: bucket.count, resetAt: bucket.resetTime };
    }
}
/**
 * WhatsApp Send Rate Limiter
 * Respects Meta limits + plan tiers
 */
export class WhatsAppSendRateLimiter {
    mockMode;
    buckets = new Map();
    constructor(mockMode = true) {
        this.mockMode = mockMode;
    }
    /**
     * Get plan allowance (messages per minute)
     */
    getPlanAllowance(planTier) {
        return PLAN_ALLOWANCES[planTier] || 10;
    }
    /**
     * Check if a message can be sent
     */
    async canSend(tenantId, planTier) {
        // In mock mode, always allow
        if (this.mockMode) {
            return { allowed: true, remaining: 100 };
        }
        const key = `whatsapp:${tenantId}`;
        const allowance = this.getPlanAllowance(planTier);
        const now = Date.now();
        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = { tokens: allowance - 1, lastRefill: now };
            this.buckets.set(key, bucket);
            return { allowed: true, remaining: allowance - 1 };
        }
        // Refill tokens based on time elapsed
        const elapsed = (now - bucket.lastRefill) / 1000; // seconds
        const refillAmount = Math.floor(elapsed); // 1 token per second
        const newTokens = Math.min(allowance, bucket.tokens + refillAmount);
        if (refillAmount > 0) {
            bucket.tokens = newTokens;
            bucket.lastRefill = now;
        }
        if (bucket.tokens <= 0) {
            const waitMs = 1000; // Wait 1 second for next token
            return { allowed: false, waitMs };
        }
        bucket.tokens--;
        return { allowed: true, remaining: bucket.tokens };
    }
    /**
     * Get current rate limit status
     */
    getStatus(tenantId, planTier) {
        const key = `whatsapp:${tenantId}`;
        const bucket = this.buckets.get(key);
        const allowance = this.getPlanAllowance(planTier);
        return {
            remaining: bucket?.tokens || allowance,
            allowance,
        };
    }
}
/**
 * Create per-tenant rate limiter
 */
export function createTenantRateLimiter(planTier) {
    const limit = getMessageRateLimit(planTier);
    return new TokenBucketRateLimiter(limit.maxRequests, limit.maxRequests / (limit.windowMs / 1000), limit.windowMs);
}
// Pre-configured rate limiters per plan tier
const PLAN_RATE_LIMITERS = {};
for (const [tier, limit] of Object.entries(RATE_LIMITS)) {
    if (tier !== 'messages_send') {
        PLAN_RATE_LIMITERS[tier] = new TokenBucketRateLimiter(limit.maxRequests, limit.maxRequests / (limit.windowMs / 1000), limit.windowMs);
    }
}
/**
 * Get rate limiter for a specific limit type
 */
export function getRateLimiter(type) {
    const config = RATE_LIMITS[type];
    return new TokenBucketRateLimiter(config.maxRequests, config.maxRequests / (config.windowMs / 1000), config.windowMs);
}
//# sourceMappingURL=rate-limit.js.map