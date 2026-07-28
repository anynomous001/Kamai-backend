import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../../config/env.js';
import type { JwtPayload } from '../../shared/types/index.js';

// ── Secret factories ──────────────────────────────────────────
// jose requires secrets as Uint8Array; lazy-evaluated to allow
// env to be fully initialised before first use.

const getAccessSecret = (): Uint8Array =>
  new TextEncoder().encode(env.JWT_SECRET);

const getRefreshSecret = (): Uint8Array =>
  new TextEncoder().encode(env.JWT_REFRESH_SECRET);

// ── Token payload (without iat / exp — added by jose) ─────────

type TokenClaims = Omit<JwtPayload, 'iat' | 'exp'>;

// ── Access Token ──────────────────────────────────────────────

/**
 * Signs a short-lived Kamai access token (default 15m).
 * Payload: sub (Baker id), email, phoneNumber, sessionId.
 */
export async function generateAccessToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({
    email: claims.email,
    phoneNumber: claims.phoneNumber,
    sessionId: claims.sessionId,
  } satisfies JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .sign(getAccessSecret());
}

/**
 * Signs a long-lived Kamai refresh token (default 7d).
 * Contains the same claims as access token — stored hash in DB enables revocation.
 */
export async function generateRefreshToken(claims: TokenClaims): Promise<string> {
  return new SignJWT({
    email: claims.email,
    phoneNumber: claims.phoneNumber,
    sessionId: claims.sessionId,
  } satisfies JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
    .sign(getRefreshSecret());
}

// ── Verification ──────────────────────────────────────────────

/**
 * Verifies and decodes a Kamai access token.
 * Throws jose errors (JWTExpired, JWSInvalid, etc.) on failure.
 */
export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getAccessSecret());
  return payload as unknown as JwtPayload;
}

/**
 * Verifies and decodes a Kamai refresh token.
 * Throws jose errors on failure.
 */
export async function verifyRefreshToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getRefreshSecret());
  return payload as unknown as JwtPayload;
}
