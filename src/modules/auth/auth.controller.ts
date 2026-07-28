import type { FastifyRequest, FastifyReply } from 'fastify';
import { SendEmailOtpBodySchema, VerifyEmailOtpBodySchema } from './auth.schemas.js';
import * as authService from './auth.service.js';
import { ValidationError, UnauthorizedError } from '../../shared/errors/index.js';
import { auditService } from '../../shared/audit/index.js';
import { env } from '../../config/env.js';

// ── Cookie Config ─────────────────────────────────────────────

const ACCESS_TOKEN_MAX_AGE = 15 * 60;           // 15 minutes in seconds
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'strict' as const,
  path: '/',
  secure: env.NODE_ENV === 'production',
} as const;

// ── Controllers ───────────────────────────────────────────────

/**
 * POST /api/auth/send-email-otp
 */
export async function sendEmailOtp(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = SendEmailOtpBodySchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Request validation failed', {
      errors: parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  const { email } = parseResult.data;
  const ipAddress = req.ip;
  const userAgent = req.headers['user-agent'];

  const result = await authService.sendEmailOtp(email, { ipAddress, userAgent });

  return reply.code(200).send(result);
}

/**
 * POST /api/auth/verify-email-otp
 */
export async function verifyEmailOtp(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = VerifyEmailOtpBodySchema.safeParse(req.body);

  if (!parseResult.success) {
    throw new ValidationError('Request validation failed', {
      errors: parseResult.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  const { email, otp } = parseResult.data;
  const { baker, accessToken, refreshToken, isNew } = await authService.verifyEmailOtp(email, otp);

  // Set HttpOnly Cookies
  reply
    .setCookie('kamai_access_token', accessToken, {
      ...COOKIE_BASE,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })
    .setCookie('kamai_refresh_token', refreshToken, {
      ...COOKIE_BASE,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });

  return reply.code(200).send({
    success: true,
    bakerId: baker.id,
    isNew,
    message: 'Authentication successful.',
  });
}

/**
 * POST /api/auth/logout
 */
export async function logout(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = req.user;
  if (!user) {
    throw new UnauthorizedError('User session invalid or missing');
  }

  const bakerId = user.bakerId || user.id;
  // 1. Revoke current refresh session in DB
  await authService.revokeSession(bakerId, user.sessionId);

  // 2. Clear cookies using exact base options
  reply
    .clearCookie('kamai_access_token', COOKIE_BASE)
    .clearCookie('kamai_refresh_token', COOKIE_BASE);

  // 3. Audit trail (safe / non-blocking)
  try {
    const loggedOutAt = new Date().toISOString();
    await auditService.logEvent('USER_LOGGED_OUT', user.id, {
      bakerId: user.id,
      sessionId: user.sessionId,
      loggedOutAt,
    });
  } catch (error) {
    console.error('[Logout] Audit logging failed:', error);
  }

  return reply.code(200).send({
    success: true,
    message: 'Logged out successfully.',
  });
}
