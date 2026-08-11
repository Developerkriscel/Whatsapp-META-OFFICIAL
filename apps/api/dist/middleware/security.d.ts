/**
 * Security Middleware - High Level Security Implementation
 * Includes: Rate limiting, Input sanitization, SQL injection prevention,
 * XSS protection, CORS, CSP headers, and more
 */
import { FastifyInstance } from 'fastify';
/**
 * Sanitize a string value
 */
export declare function sanitizeString(value: string): string;
/**
 * Deep sanitize an object recursively
 */
export declare function sanitizeObject(obj: any, depth?: number): any;
/**
 * Check for SQL injection attempts
 */
export declare function detectSQLInjection(value: string): boolean;
/**
 * Check for XSS attempts
 */
export declare function detectXSS(value: string): boolean;
/**
 * Generate a secure random token
 */
export declare function generateSecureToken(length?: number): string;
/**
 * Hash a sensitive value (for logging purposes - not password hashing)
 */
export declare function hashForLogging(value: string): string;
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
export declare function validateInput(input: any): SecurityValidation;
/**
 * Register security middleware
 */
export declare function securityMiddleware(app: FastifyInstance): Promise<void>;
/**
 * Password hashing (using crypto for secure hashing)
 */
export declare function hashPassword(password: string, salt?: string): Promise<{
    hash: string;
    salt: string;
}>;
/**
 * Verify password hash
 */
export declare function verifyPassword(password: string, hash: string, salt: string): Promise<boolean>;
/**
 * Generate CSRF token
 */
export declare function generateCSRFToken(): string;
/**
 * Validate CSRF token
 */
export declare function validateCSRFToken(token: string, expected: string): boolean;
export {};
//# sourceMappingURL=security.d.ts.map