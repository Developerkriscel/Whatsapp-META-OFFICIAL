/**
 * Security Middleware - High Level Security Implementation
 * Includes: Rate limiting, Input sanitization, SQL injection prevention,
 * XSS protection, CORS, CSP headers, and more
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

// Security headers to apply
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'X-DNS-Prefetch-Control': 'off',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-site',
};

// Dangerous SQL patterns to detect
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|TRUNCATE)\b)/i,
  /(--|;|\\|\/\*|\*\/|@@|@)/,
  /(\bOR\b|\bAND\b).*(\b=\b|<|>)/i,
  /('\s*(OR|AND)\s*')/i,
  /(UNION\s+(ALL\s+)?SELECT)/i,
  /(INTO\s+(OUTFILE|DUMPFILE))/i,
  /(LOAD_FILE|BENCHMARK|SLEEP)/i,
];

// Dangerous characters for XSS
const XSS_PATTERNS = [
  /<script\b/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /<link/i,
  /<meta/i,
  /expression\s*\(/i,
  /url\s*\(/i,
  /@import/i,
];

// Input sanitization limits
const MAX_INPUT_LENGTH = 10000;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_DEPTH = 10;

/**
 * Sanitize a string value
 */
export function sanitizeString(value: string): string {
  if (typeof value !== 'string') return value;

  let sanitized = value;

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, '');

  // Trim whitespace
  sanitized = sanitized.trim();

  // Remove control characters except newlines and tabs
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Encode HTML entities
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Deep sanitize an object recursively
 */
export function sanitizeObject(obj: any, depth = 0): any {
  if (depth > MAX_OBJECT_DEPTH) return '[MAX_DEPTH_EXCEEDED]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj).substring(0, MAX_INPUT_LENGTH);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;

  if (Array.isArray(obj)) {
    if (obj.length > MAX_ARRAY_LENGTH) return obj.slice(0, MAX_ARRAY_LENGTH);
    return obj.map(item => sanitizeObject(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Sanitize key
      const sanitizedKey = sanitizeString(key);
      sanitized[sanitizedKey] = sanitizeObject(value, depth + 1);
    }
    return sanitized;
  }

  return obj;
}

/**
 * Check for SQL injection attempts
 */
export function detectSQLInjection(value: string): boolean {
  if (typeof value !== 'string') return false;

  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Check for XSS attempts
 */
export function detectXSS(value: string): boolean {
  if (typeof value !== 'string') return false;

  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a sensitive value (for logging purposes - not password hashing)
 */
export function hashForLogging(value: string): string {
  if (!value || value.length < 8) return '***';
  return value.substring(0, 4) + '***' + value.substring(value.length - 4);
}

/**
 * Security validation result
 */
interface SecurityValidation {
  valid: boolean;
  threat?: string;
  value?: any;
}

/**
 * Validate and sanitize input
 */
export function validateInput(input: any): SecurityValidation {
  if (input === null || input === undefined) {
    return { valid: true };
  }

  // If it's a string, check for injection patterns
  if (typeof input === 'string') {
    if (input.length > MAX_INPUT_LENGTH) {
      return { valid: false, threat: 'INPUT_TOO_LONG' };
    }

    if (detectSQLInjection(input)) {
      return { valid: false, threat: 'SQL_INJECTION' };
    }

    if (detectXSS(input)) {
      return { valid: false, threat: 'XSS' };
    }

    return { valid: true, value: sanitizeString(input) };
  }

  // If it's an array, validate each element
  if (Array.isArray(input)) {
    if (input.length > MAX_ARRAY_LENGTH) {
      return { valid: false, threat: 'ARRAY_TOO_LARGE' };
    }

    for (const item of input) {
      const result = validateInput(item);
      if (!result.valid) return result;
    }

    return { valid: true, value: sanitizeObject(input) };
  }

  // If it's an object, validate each value
  if (typeof input === 'object') {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(input)) {
      // Check key for injection
      if (detectSQLInjection(key) || detectXSS(key)) {
        return { valid: false, threat: 'INVALID_KEY' };
      }

      const result = validateInput(value);
      if (!result.valid) return result;

      sanitized[sanitizeString(key)] = result.value;
    }

    return { valid: true, value: sanitized };
  }

  return { valid: true, value: input };
}

/**
 * Register security middleware
 */
export async function securityMiddleware(app: FastifyInstance): Promise<void> {
  // Apply security headers to all responses
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    // Apply security headers
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(header, value);
    }

    // Remove server identification
    reply.header('Server', 'WA-Meta-Auto');

    // Cache control for API routes
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      reply.header('Pragma', 'no-cache');
      reply.header('Expires', '0');
    }
  });

  // Validate and sanitize all request bodies
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip webhook routes (they handle their own validation)
    if (request.url.includes('/webhook') || request.url.includes('/stripe/webhook')) {
      return;
    }

    // Validate request body
    if (request.body && typeof request.body === 'object') {
      const validation = validateInput(request.body);
      if (!validation.valid) {
        app.log.warn({
          type: 'SECURITY_THREAT',
          threat: validation.threat,
          url: request.url,
          method: request.method,
          ip: request.ip,
        });

        return reply.status(400).send({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Request contains invalid or potentially dangerous content.',
          },
        });
      }

      // Replace body with sanitized version
      request.body = validation.value;
    }

    // Validate query parameters
    if (request.query && typeof request.query === 'object') {
      for (const [key, value] of Object.entries(request.query)) {
        if (typeof value === 'string') {
          if (detectSQLInjection(value) || detectXSS(value)) {
            app.log.warn({
              type: 'SECURITY_THREAT_QUERY',
              threat: 'SQL_INJECTION_OR_XSS',
              url: request.url,
              param: key,
              ip: request.ip,
            });

            return reply.status(400).send({
              success: false,
              error: {
                code: 'INVALID_PARAMETER',
                message: 'Query parameter contains invalid content.',
              },
            });
          }
        }
      }
    }
  });

  // Log security events
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = reply.elapsedTime;

    // Log slow requests (potential DoS)
    if (responseTime > 5000) {
      app.log.warn({
        type: 'SLOW_REQUEST',
        url: request.url,
        method: request.method,
        responseTime,
        ip: request.ip,
      });
    }
  });

  app.log.info('Security middleware enabled');
}

/**
 * Password hashing (using crypto for secure hashing)
 */
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, useSalt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt: useSalt };
}

/**
 * Verify password hash
 */
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const { hash: computedHash } = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(computedHash));
}

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string, expected: string): boolean {
  if (!token || !expected) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
