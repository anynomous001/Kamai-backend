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
import { googleAuthService } from './google-auth.service.js';


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

// ── Google Sign-In ───────────────────────────────────────────────

export interface GoogleSignInResult {
  baker: Baker;
  accessToken: string;
  refreshToken: string;
  isNew: boolean;
}

/**
 * Verifies a Google Identity Services ID token, then find-or-creates a
 * Baker by its (Google-verified) email — mirroring verifyEmailOtp's
 * find-or-create/suspension-check/createSession shape exactly, so a
 * baker's identity and session semantics are identical regardless of
 * which method they logged in with. Never creates a second Baker row for
 * an email that already exists, and never mints tokens through any path
 * other than the shared `createSession`.
 */
export async function signInWithGoogle(idToken: string): Promise<GoogleSignInResult> {
  const { email } = await googleAuthService.verifyIdToken(idToken);

  let baker = await prisma.baker.findUnique({ where: { email } });

  let isNew = false;
  if (!baker) {
    baker = await TenantService.provisionTenant(email);
    isNew = true;
  } else if (baker.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact Kamai support.');
  }

  const { accessToken, refreshToken } = await createSession(baker);

  await auditService.logEvent(isNew ? 'GOOGLE_SIGNIN_NEW_TENANT' : 'GOOGLE_SIGNIN_SUCCESS', baker.id, {
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

// A rotated-out token replayed within this window of its revocation is
// treated as a benign concurrent-request race (two near-simultaneous
// refresh calls carrying the same cookie — e.g. two tabs, or a mobile app
// cold-launch racing a still-in-flight request from the instance it just
// replaced) rather than theft. Genuine replay attacks show up long after
// the legitimate rotation, not milliseconds after it.
const REUSE_GRACE_WINDOW_MS = 10_000;

/**
 * Exchanges a valid refresh token for a brand-new access + refresh token
 * pair, following the industry-standard "rotate on every use" pattern
 * (OWASP / Auth0 refresh token best practices).
 *
 * The "is this token still valid?" check and the act of consuming it are
 * a single atomic, conditional UPDATE (see the `updateMany` below) rather
 * than a separate read followed by a later write — that read-then-write
 * gap is exactly what let two near-simultaneous refresh calls both
 * observe "not yet revoked" and race each other, with the loser then
 * misreading the winner's legitimate rotation as theft. The database's
 * row-level locking on that single UPDATE statement is what actually
 * decides who "wins" a race now, not application code.
 *
 *  1. Verify the refresh JWT's signature and expiry (`jose`).
 *  2. Atomically claim the DB row by the SHA-256 hash of the raw token
 *     (never by the client-supplied sessionId alone — the hash is the
 *     actual proof-of-possession), conditional on it not already being
 *     revoked. Exactly one concurrent caller can ever win this for a
 *     given token.
 *  3. Winner: rotate into a brand-new session as before.
 *  4. Loser (or a solo call hitting an already-revoked/missing row):
 *     - Row doesn't exist at all ⇒ this exact token was never legitimately
 *       issued — theft signal, mass-revoke.
 *     - Row was revoked more than REUSE_GRACE_WINDOW_MS ago ⇒ genuine
 *       replay of a long-since-rotated token — theft signal, mass-revoke.
 *       Unchanged from the original behavior.
 *     - Row was revoked within REUSE_GRACE_WINDOW_MS ⇒ benign race. This
 *       caller simply lost a race by milliseconds; nothing malicious
 *       happened. It gets its own independent, fully valid new session
 *       for the same baker instead of being punished — raw tokens are
 *       never persisted (only hashes), so "handing back the winner's
 *       tokens" isn't possible even in principle; minting an equally
 *       valid new session achieves the same outcome for the caller.
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

  // 2. Atomic, conditional claim — the actual proof-of-possession check and
  // the consumption of the token happen as one statement. `count` tells us
  // whether *this* call was the one that flipped revokedAt from null.
  const claim = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (claim.count === 1) {
    // We won the claim (or there was no contention at all) — proceed to
    // rotate into a brand-new session, same as the original flow.
    const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!record) {
      // Not reachable in practice (we just updated this exact row), but
      // keeps this branch exhaustive for TypeScript without an assertion.
      throw new UnauthorizedError('Session not found.', 'SESSION_NOT_FOUND');
    }

    // Naturally expired (per DB record) — not an attack signal, just
    // expiry. The claim above already revoked it, which is harmless: an
    // expired row was never going to be usable again regardless.
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token has expired.', 'REFRESH_TOKEN_EXPIRED');
    }

    const baker = await prisma.baker.findUnique({ where: { id: record.bakerId } });
    if (!baker) {
      throw new UnauthorizedError('Session not found.', 'SESSION_NOT_FOUND');
    }
    if (baker.status === 'SUSPENDED') {
      throw new ForbiddenError('Your account has been suspended. Please contact Kamai support.');
    }

    const { accessToken, refreshToken, sessionId } = await createSession(baker);

    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { rotatedToTokenId: sessionId },
    });

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

  // 3. We didn't win the claim — the row was either never ours to begin
  // with, or someone (possibly a concurrent legitimate caller) already
  // revoked it. Figure out which.
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!record) {
    await revokeAllSessions(bakerId);
    await auditService.logEvent('REFRESH_TOKEN_REUSE_DETECTED', bakerId, {
      sessionId: payload.sessionId,
      reason: 'token_not_found',
    });
    throw new UnauthorizedError(
      'This session is no longer valid. Please sign in again.',
      'REFRESH_TOKEN_INVALID',
    );
  }

  const revokedMsAgo = record.revokedAt ? Date.now() - record.revokedAt.getTime() : Infinity;

  if (revokedMsAgo > REUSE_GRACE_WINDOW_MS) {
    // Genuine replay of a long-since-rotated token — unchanged behavior.
    await revokeAllSessions(bakerId);
    await auditService.logEvent('REFRESH_TOKEN_REUSE_DETECTED', bakerId, {
      sessionId: payload.sessionId,
      reason: 'token_already_revoked',
    });
    throw new UnauthorizedError(
      'This session is no longer valid. Please sign in again.',
      'REFRESH_TOKEN_INVALID',
    );
  }

  // 4. Within the grace window: a benign concurrent-request race, not
  // theft. Mint an independent new session for this caller so it ends up
  // authenticated exactly as if it had won the race, without touching any
  // other session.
  const baker = await prisma.baker.findUnique({ where: { id: record.bakerId } });
  if (!baker) {
    throw new UnauthorizedError('Session not found.', 'SESSION_NOT_FOUND');
  }
  if (baker.status === 'SUSPENDED') {
    throw new ForbiddenError('Your account has been suspended. Please contact Kamai support.');
  }

  const { accessToken, refreshToken, sessionId } = await createSession(baker);

  await auditService.logEvent('REFRESH_TOKEN_RACE_RESOLVED', baker.id, {
    losingSessionId: payload.sessionId,
    winningSessionId: record.rotatedToTokenId,
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
