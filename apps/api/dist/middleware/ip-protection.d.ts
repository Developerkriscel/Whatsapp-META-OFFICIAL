/**
 * IP Protection & Request Validation Utilities
 * Part of the high-level security implementation
 */
import { FastifyRequest } from 'fastify';
export declare const MAX_BODY_SIZES: {
    json: string;
    form: string;
    multipart: string;
};
/**
 * Get the real client IP address
 */
export declare function getClientIP(request: FastifyRequest): string;
/**
 * Check if IP is blocked
 */
export declare function isIPBlocked(ip: string): boolean;
/**
 * Generate request fingerprint for rate limiting
 */
export declare function generateRequestFingerprint(request: FastifyRequest): string;
/**
 * Validate email format
 */
export declare function isValidEmail(email: string): boolean;
/**
 * Validate URL format
 */
export declare function isValidUrl(url: string): boolean;
/**
 * Sanitize filename for uploads
 */
export declare function sanitizeFilename(filename: string): string;
/**
 * Password strength validation
 */
export declare function validatePasswordStrength(password: string): {
    valid: boolean;
    score: number;
    feedback: string[];
};
/**
 * Validate phone number format (E.164)
 */
export declare function isValidPhone(phone: string): boolean;
/**
 * Check for suspicious patterns in input
 */
export declare function detectSuspiciousInput(input: string): boolean;
/**
 * Log security event
 */
export declare function logSecurityEvent(request: FastifyRequest, eventType: string, details: Record<string, any>): void;
/**
 * Validate UUID format
 */
export declare function isValidUUID(uuid: string): boolean;
/**
 * Sanitize output for logging (remove sensitive data)
 */
export declare function sanitizeForLogging(obj: any, depth?: number): any;
//# sourceMappingURL=ip-protection.d.ts.map