import { createHash } from 'node:crypto';

import type { Baker } from '@prisma/client';

import { prisma } from '../../shared/database/prisma.js';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors/index.js';
import { env } from '../../config/env.js';
import { auditService } from '../../shared/audit/index.js';
import type { JwtPayload } from '../../shared/types/index.js';

import * as jwtService from './jwt.service.js';
import { OtpService, type SendOtpResult } from './otp.service.js';
import { TenantService } from './tenant.service.js';


// ── Session Creation ──────────────────────────────────────────

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/**
 * Issues a new Kamai session for the given baker.
 *
 * - Generates signed access JWT (15m) and refresh JWT (7d).
 * - Stores only the SHA-256 hash of the refresh token in the DB.
 * - Raw refresh token is NEVER persisted.
 * - sessionId = RefreshToken.id (referenced in JWT payload for revocation).
 */
export async function createSession(baker: Baker): Promise<SessionTokens> {
  const sessionId = crypto.randomUUID();

  const tokenClaims = {
    sub: baker.id,
    email: baker.email ?? undefined,
    phoneNumber: baker.phoneNumber ?? undefined,
    sessionId,
  };

  // Sign both tokens concurrently
  const [accessToken, refreshToken] = await Promise.all([
    jwtService.generateAccessToken(tokenClaims),
    jwtService.generateRefreshToken(tokenClaims),
  ]);

  // Hash the refresh token — never store raw JWT
  const tokenHash = createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Persist hashed refresh token with calculated expiry
  await prisma.refreshToken.create({
    data: {
      id: sessionId,
      tokenHash,
      bakerId: baker.id,
      expiresAt: parseExpiry(env.JWT_REFRESH_EXPIRES_IN),
    },
  });

  return { accessToken, refreshToken, sessionId };
}

// ── Session Revocation ────────────────────────────────────────

/**
 * Revokes a specific session for a baker by updating the RefreshToken record.
 */
export async function revokeSession(
  bakerId: string,
  sessionId: string,
): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      bakerId,
      id: sessionId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

/**
 * Revokes every active (non-revoked) session for a baker.
 *
 * Used as the containment action when refresh-token reuse is detected —
 * a rotated-out refresh token being replayed is treated as a signal that
 * the token (and therefore possibly the whole session chain) has been
 * compromised, so every device is forced to re-authenticate.
 */
export async function revokeAllSessions(bakerId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: {
      bakerId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

// ── Email OTP ──────────────────────────────────────────────────

export interface VerifyEmailOtpResult {
  baker: Baker;
  accessToken: string;
  refreshToken: string;
  isNew: boolean;
}

/**
 * Validates email, checks rate limits, generates/hashes OTP, saves record,
 * and sends email via shared email service.
 */
export async function sendEmailOtp(
  emailInput: string,
  options?: { ipAddress?: string; userAgent?: string },
): Promise<SendOtpResult> {
  return OtpService.requestOtp(emailInput, options);
}

/**
 * Verifies email OTP, provisions tenant if first login, creates session & JWT.
 */
export async function verifyEmailOtp(
  emailInput: string,
  otp: string,
): Promise<VerifyEmailOtpResult> {
  // 1. Verify OTP (throws GoneError, TooManyRequestsError, UnauthorizedError if invalid)
  const { email } = await OtpService.verifyOtp(emailInput, otp);

  // 2. Find existing Baker or Provision Tenant
  let baker = await prisma.baker.findUnique({
    where: { email },
  });

  let isNew = false;
  if (!baker) {
    baker = await TenantService.provisionTenant(email);
    isNew = true;
  } else if (baker.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact Kamai support.');
  }

  // 3. Create Session & Tokens
  const { accessToken, refreshToken } = await createSession(baker);

  // 4. Audit Log
  await auditService.logEvent('EMAIL_OTP_VERIFICATION_SUCCESS', baker.id, {
    email,
    isNew,
  });

  return {
    baker,
    accessToken,
    refreshToken,
    isNew,
  };
}

// ── Session Refresh (Rotation + Reuse Detection) ────────────────

export interface RefreshSessionResult {
  bakerId: string;
  accessToken: string;
  refreshToken: string;
  sessionId: string;
}

/**
 * Exchanges a valid refresh token for a brand-new access + refresh token
 * pair, following the industry-standard "rotate on every use" pattern
 * (OWASP / Auth0 refresh token best practices):
 *
 *  1. Verify the refresh JWT's signature and expiry (`jose`).
 *  2. Look up the corresponding DB row by the SHA-256 hash of the raw
 *     token (never by the client-supplied sessionId alone — the hash is
 *     the actual proof-of-possession).
 *  3. If the row is missing or already revoked, this exact refresh token
 *     has either never existed or was already rotated out and is now
 *     being replayed — a strong signal of token theft. Every active
 *     session for that baker is revoked and the caller is forced to
 *     fully re-authenticate.
 *  4. If the row is valid, it is atomically revoked (old token can never
 *     be used again) and a new session (new sessionId, new access +
 *     refresh JWTs, new DB row) is issued in its place.
 *
 * Throws UnauthorizedError for every failure path; the HTTP layer always
 * responds 401 and the client must fall back to full re-login.
 */
export async function refreshSession(
  rawRefreshToken: string,
): Promise<RefreshSessionResult> {
  // 1. Verify signature + expiry on the JWT itself.
  let payload: JwtPayload;
  try {
    payload = await jwtService.verifyRefreshToken(rawRefreshToken);
  } catch (error) {
    const code = (error as { code?: string }).code;
    const isExpired = code === 'ERR_JWT_EXPIRED';
    throw new UnauthorizedError(
      isExpired ? 'Refresh token has expired.' : 'Invalid refresh token.',
      isExpired ? 'REFRESH_TOKEN_EXPIRED' : 'REFRESH_TOKEN_INVALID',
    );
  }

  const bakerId = payload.sub;
  const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');

  // 2. Look up the DB row by the token's hash — the actual proof-of-possession.
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  // 3. Missing row OR already-revoked row (rotated-out token replayed) ⇒ reuse/theft.
  if (!record || record.revokedAt !== null) {
    await revokeAllSessions(bakerId);
    await auditService.logEvent('REFRESH_TOKEN_REUSE_DETECTED', bakerId, {
      sessionId: payload.sessionId,
      reason: record ? 'token_already_revoked' : 'token_not_found',
    });
    throw new UnauthorizedError(
      'This session is no longer valid. Please sign in again.',
      'REFRESH_TOKEN_INVALID',
    );
  }

  // 4. Naturally expired (per DB record) — not an attack signal, just expiry.
  if (record.expiresAt < new Date()) {
    throw new UnauthorizedError('Refresh token has expired.', 'REFRESH_TOKEN_EXPIRED');
  }

  // 5. Confirm the baker still exists and is not suspended before reissuing tokens.
  const baker = await prisma.baker.findUnique({ where: { id: record.bakerId } });
  if (!baker) {
    throw new UnauthorizedError('Session not found.', 'SESSION_NOT_FOUND');
  }
  if (baker.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact Kamai support.');
  }

  // 6. Rotate: revoke the old row, then issue a brand-new session.
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  const { accessToken, refreshToken, sessionId } = await createSession(baker);

  await auditService.logEvent('REFRESH_TOKEN_ROTATED', baker.id, {
    previousSessionId: record.id,
    newSessionId: sessionId,
  });

  return {
    bakerId: baker.id,
    accessToken,
    refreshToken,
    sessionId,
  };
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Converts a jose-style expiry string ('15m', '7d', '1h') to a future Date.
 */
function parseExpiry(expiresIn: string): Date {
  const unit = expiresIn.slice(-1);
  const value = parseInt(expiresIn.slice(0, -1), 10);
  const now = Date.now();

  const ms: Record<string, number> = {
    s: 1_000,
    m: 60 * 1_000,
    h: 60 * 60 * 1_000,
    d: 24 * 60 * 60 * 1_000,
  };

  return new Date(now + value * (ms[unit] ?? 1_000));
}
