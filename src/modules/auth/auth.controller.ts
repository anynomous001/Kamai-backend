import type { FastifyRequest, FastifyReply } from 'fastify';

import { ValidationError, UnauthorizedError } from '../../shared/errors/index.js';
import { auditService } from '../../shared/audit/index.js';
import { env } from '../../config/env.js';

import * as authService from './auth.service.js';
import { SendEmailOtpBodySchema, VerifyEmailOtpBodySchema } from './auth.schemas.js';

// ── Cookie Config ─────────────────────────────────────────────

const ACCESS_TOKEN_MAX_AGE = 15 * 60;           // 15 minutes in seconds
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Frontend (app.getkamai.online) and backend (onrender.com) are different
// registrable domains, so this is a cross-site request from the browser's
// point of view. SameSite=Strict (and even Lax) would stop the browser from
// ever attaching these cookies to cross-site fetches, breaking auth entirely.
// SameSite=None is required for cross-site cookies, which in turn requires Secure.
const COOKIE_BASE = {
  httpOnly: true,
  sameSite: env.NODE_ENV === 'production' ? ('none' as const) : ('lax' as const),
  path: '/',
  secure: env.NODE_ENV === 'production',
} as const;

/**
 * Sets both the access and refresh token HttpOnly cookies on a reply.
 * Shared by the login and refresh handlers so cookie semantics
 * (flags, max-age) can never drift between the two issuance points.
 */
function setSessionCookies(
  reply: FastifyReply,
  tokens: { accessToken: string; refreshToken: string },
): FastifyReply {
  return reply
    .setCookie('kamai_access_token', tokens.accessToken, {
      ...COOKIE_BASE,
      maxAge: ACCESS_TOKEN_MAX_AGE,
    })
    .setCookie('kamai_refresh_token', tokens.refreshToken, {
      ...COOKIE_BASE,
      maxAge: REFRESH_TOKEN_MAX_AGE,
    });
}

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
  setSessionCookies(reply, { accessToken, refreshToken });

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

/**
 * POST /api/auth/refresh
 *
 * Intentionally NOT behind `app.authenticate` — the whole point of this
 * endpoint is to mint a new access token once the old one has expired,
 * so requiring a valid access token as a precondition would defeat it.
 * Trust is instead established purely via the `kamai_refresh_token`
 * HttpOnly cookie, which `authService.refreshSession` verifies.
 */
export async function refresh(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const rawRefreshToken = req.cookies.kamai_refresh_token;

  if (!rawRefreshToken) {
    throw new UnauthorizedError('Missing refresh token', 'REFRESH_TOKEN_INVALID');
  }

  const { bakerId, accessToken, refreshToken } = await authService.refreshSession(rawRefreshToken);

  setSessionCookies(reply, { accessToken, refreshToken });

  return reply.code(200).send({
    success: true,
    bakerId,
    message: 'Session refreshed successfully.',
  });
}
