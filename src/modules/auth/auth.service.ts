import { createHash } from 'node:crypto';
import type { Baker } from '@prisma/client';
import { prisma } from '../../shared/database/prisma.js';
import { ForbiddenError } from '../../shared/errors/index.js';
import { env } from '../../config/env.js';
import * as jwtService from './jwt.service.js';
import { OtpService, type SendOtpResult } from './otp.service.js';
import { auditService } from '../../shared/audit/index.js';
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
