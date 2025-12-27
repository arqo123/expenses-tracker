import type { Context, Next } from 'hono';
import { getEnv } from '../config/env.ts';

/**
 * Security middleware for the expense tracker API
 * Implements API key authentication, rate limiting, and input validation
 */

// In-memory rate limit store (for production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * API Key Authentication Middleware
 * Validates X-API-Key header against configured API keys
 */
export function apiKeyAuth() {
  return async (c: Context, next: Next) => {
    const env = getEnv();

    // Skip authentication in development mode if no API keys configured
    if (env.NODE_ENV === 'development' && !env.API_KEYS?.length) {
      await next();
      return;
    }

    const apiKey = c.req.header('X-API-Key');

    if (!apiKey) {
      return c.json({
        error: 'Authentication required',
        code: 'MISSING_API_KEY'
      }, 401);
    }

    if (!env.API_KEYS?.includes(apiKey)) {
      // Log failed authentication attempt (without exposing the key)
      console.warn(`[Security] Failed authentication attempt from ${getClientIP(c)}`);

      return c.json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      }, 401);
    }

    await next();
  };
}

/**
 * Rate Limiting Middleware
 * Limits requests per IP/key to prevent abuse
 */
export function rateLimit(options: {
  windowMs?: number;
  maxRequests?: number;
  keyGenerator?: (c: Context) => string;
} = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute
    maxRequests = 60,      // 60 requests per minute
    keyGenerator = getClientIP,
  } = options;

  return async (c: Context, next: Next) => {
    const key = keyGenerator(c);
    const now = Date.now();

    // Get or create rate limit entry
    let entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      entry = { count: 0, resetTime: now + windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    c.header('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

    if (entry.count > maxRequests) {
      console.warn(`[Security] Rate limit exceeded for ${key}`);

      return c.json({
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((entry.resetTime - now) / 1000),
      }, 429);
    }

    await next();
  };
}

/**
 * Strict rate limit for expensive operations (AI, file processing)
 */
export function strictRateLimit() {
  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,      // 10 requests per minute
  });
}

/**
 * Input Size Validation Middleware
 * Prevents large payload attacks
 */
export function validateInputSize(maxBytes: number = 1024 * 1024) { // 1MB default
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header('content-length');

    if (contentLength && parseInt(contentLength) > maxBytes) {
      return c.json({
        error: 'Request body too large',
        code: 'PAYLOAD_TOO_LARGE',
        maxBytes,
      }, 413);
    }

    await next();
  };
}

/**
 * Security Headers Middleware
 * Adds security headers to all responses
 */
export function securityHeaders() {
  return async (c: Context, next: Next) => {
    await next();

    // Prevent clickjacking
    c.header('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    c.header('X-Content-Type-Options', 'nosniff');

    // Enable XSS protection
    c.header('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");

    // Strict Transport Security (for HTTPS)
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Permissions Policy
    c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  };
}

/**
 * Request Logging Middleware for security auditing
 */
export function auditLog() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const path = c.req.path;
    const method = c.req.method;
    const ip = getClientIP(c);

    await next();

    const duration = Date.now() - start;
    const status = c.res.status;

    // Log security-relevant requests
    if (status === 401 || status === 403 || status === 429) {
      console.warn(`[Audit] ${method} ${path} - ${status} - ${ip} - ${duration}ms`);
    }
  };
}

/**
 * Get client IP address from request
 */
function getClientIP(c: Context): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'unknown'
  );
}

/**
 * Sanitize error messages for production
 * Prevents leaking sensitive information in error responses
 */
export function sanitizeError(error: unknown, isDevelopment: boolean): string {
  if (isDevelopment) {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  // In production, return generic messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for specific error types and return safe messages
    if (message.includes('database') || message.includes('pg') || message.includes('sql')) {
      return 'Database operation failed';
    }
    if (message.includes('openrouter') || message.includes('api')) {
      return 'AI service temporarily unavailable';
    }
    if (message.includes('telegram')) {
      return 'Messaging service error';
    }
    if (message.includes('timeout')) {
      return 'Request timed out';
    }
  }

  return 'An unexpected error occurred';
}

/**
 * Validate user parameter
 * Ensures user parameter is valid and authorized
 */
export function validateUserParam(allowedUsers: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.req.query('user') || c.req.param('user');

    if (!user) {
      return c.json({
        error: 'User parameter required',
        code: 'MISSING_USER'
      }, 400);
    }

    // Validate user format (alphanumeric, underscore, hyphen, 1-50 chars)
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(user)) {
      return c.json({
        error: 'Invalid user format',
        code: 'INVALID_USER_FORMAT'
      }, 400);
    }

    if (!allowedUsers.includes(user)) {
      console.warn(`[Security] Unauthorized user access attempt: ${user}`);
      return c.json({
        error: 'Unauthorized user',
        code: 'UNAUTHORIZED_USER'
      }, 403);
    }

    await next();
  };
}

/**
 * Telegram webhook signature verification
 * Validates X-Telegram-Bot-Api-Secret-Token header
 */
export function verifyTelegramWebhook() {
  return async (c: Context, next: Next) => {
    const env = getEnv();

    // Skip verification if no secret is configured (but warn)
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      if (env.NODE_ENV === 'production') {
        console.warn('[Security] Telegram webhook secret not configured - this is insecure in production!');
      }
      await next();
      return;
    }

    const signature = c.req.header('X-Telegram-Bot-Api-Secret-Token');

    if (!signature || signature !== env.TELEGRAM_WEBHOOK_SECRET) {
      console.warn(`[Security] Invalid Telegram webhook signature from ${getClientIP(c)}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }

    await next();
  };
}

/**
 * Cleanup old rate limit entries periodically
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}

// Cleanup every 5 minutes
setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
