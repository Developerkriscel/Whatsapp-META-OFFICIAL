/**
 * IP Protection & Request Validation Utilities
 * Part of the high-level security implementation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

// Known malicious IP patterns (partial ranges for cloud services used for attacks)
const BLOCKED_IP_PREFIXES: string[] = [
  // Add IP ranges to block here
];

// Trusted proxy headers
const TRUSTED_PROXY_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip', // Cloudflare
  'x-cluster-client-ip',
];

// Max request body sizes
export const MAX_BODY_SIZES = {
  json: '1mb',
  form: '1mb',
  multipart: '10mb',
};

/**
 * Get the real client IP address
 */
export function getClientIP(request: FastifyRequest): string {
  const headers = request.headers;

  for (const header of TRUSTED_PROXY_HEADERS) {
    const value = headers[header];
    if (value) {
      // X-Forwarded-For can contain multiple IPs, take the first one
      const ip = Array.isArray(value) ? value[0] : value.split(',')[0];
      return ip.trim();
    }
  }

  return request.ip;
}

/**
 * Check if IP is blocked
 */
export function isIPBlocked(ip: string): boolean {
  // Check exact match
  if (BLOCKED_IP_PREFIXES.includes(ip)) {
    return true;
  }

  // Check prefix match
  for (const prefix of BLOCKED_IP_PREFIXES) {
    if (ip.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate request fingerprint for rate limiting
 */
export function generateRequestFingerprint(request: FastifyRequest): string {
  const ip = getClientIP(request);
  const userAgent = request.headers['user-agent'] || 'unknown';
  const path = request.url;

  const data = `${ip}:${userAgent}:${path}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const strictEmailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email) && strictEmailRegex.test(email);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Sanitize filename for uploads
 */
export function sanitizeFilename(filename: string): string {
  // Remove path traversal and special characters
  return filename
    .replace(/\.\./g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/[\/\\]/g, '_')
    .substring(0, 255);
}

/**
 * Password strength validation
 */
export function validatePasswordStrength(password: string): {
  valid: boolean;
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters');
  } else {
    score += 1;
  }

  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Add lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Add uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Add numbers');

  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  else feedback.push('Add special characters');

  // Check for common weak passwords
  const commonPasswords = [
    'password', '123456', 'qwerty', 'admin', 'letmein',
    'welcome', 'monkey', 'dragon', 'master', 'login',
  ];

  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    score = 0;
    feedback.push('Avoid common password patterns');
  }

  return {
    valid: score >= 4 && password.length >= 8,
    score: Math.min(score, 10),
    feedback,
  };
}

/**
 * Validate phone number format (E.164)
 */
export function isValidPhone(phone: string): boolean {
  // E.164 format: +[country code][number]
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  return e164Regex.test(phone.replace(/[\s\-()]/g, ''));
}

/**
 * Check for suspicious patterns in input
 */
export function detectSuspiciousInput(input: string): boolean {
  const suspiciousPatterns = [
    /\b(or|and)\s*1\s*=\s*1\b/i,
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /\.\.\//g,  // Path traversal
    /%2e%2e%2f/gi,  // URL encoded path traversal
    /eval\s*\(/i,
    /base64_decode\s*\(/i,
    /\bexec\b/i,
    /\bsystem\b/i,
    /\bshell_exec\b/i,
  ];

  return suspiciousPatterns.some(pattern => pattern.test(input));
}

/**
 * Log security event
 */
export function logSecurityEvent(
  request: FastifyRequest,
  eventType: string,
  details: Record<string, any>
): void {
  const ip = getClientIP(request);

  console.log(JSON.stringify({
    type: 'SECURITY',
    event: eventType,
    ip,
    userAgent: request.headers['user-agent'],
    url: request.url,
    method: request.method,
    timestamp: new Date().toISOString(),
    ...details,
  }));
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sanitize output for logging (remove sensitive data)
 */
export function sanitizeForLogging(obj: any, depth = 0): any {
  if (depth > 5) return '[MAX_DEPTH]';
  if (obj === null || obj === undefined) return obj;

  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'creditCard', 'ssn', 'pin', 'cvv', 'accessToken',
    'refreshToken', 'apiKey', 'privateKey', 'sessionId',
  ];

  if (typeof obj === 'string') {
    // Mask sensitive strings
    for (const key of sensitiveKeys) {
      if (obj.toLowerCase().includes(key)) {
        return '[MASKED]';
      }
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
        sanitized[key] = '[MASKED]';
      } else {
        sanitized[key] = sanitizeForLogging(value, depth + 1);
      }
    }
    return sanitized;
  }

  return obj;
}
