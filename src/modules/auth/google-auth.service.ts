import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '../../config/env.js';
import { ServiceUnavailableError, UnauthorizedError } from '../../shared/errors/index.js';

// Google's published, rotating public keys for verifying Identity Services
// ID tokens — no client secret involved. An ID token is a signed
// assertion the client already obtained from Google; verifying it here is
// a pure public-key check, the same category of operation as
// jwtService.verifyAccessToken verifying Kamai's own tokens, just against
// someone else's keys.
const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs');
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

export interface GoogleIdentity {
  email: string;
}

export class GoogleAuthService {
  // Lazily created (not at module load) so importing this file never
  // makes a network call on its own, and so a test that mocks
  // verifyIdToken entirely never needs a reachable JWKS endpoint.
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  private getJwks(): ReturnType<typeof createRemoteJWKSet> {
    if (!this.jwks) {
      this.jwks = createRemoteJWKSet(GOOGLE_JWKS_URL);
    }
    return this.jwks;
  }

  /**
   * Verifies a Google Identity Services ID token entirely server-side —
   * signature against Google's public keys, issuer, audience (this app's
   * GOOGLE_CLIENT_ID), and expiry (all enforced by `jwtVerify` itself) —
   * then additionally checks the `email_verified` claim, since a bare
   * `email` claim alone isn't proof Google itself verified it. Never
   * trusts anything the client merely asserts about who it is.
   */
  async verifyIdToken(idToken: string): Promise<GoogleIdentity> {
    if (!env.GOOGLE_CLIENT_ID) {
      throw new ServiceUnavailableError(
        'Google sign-in is not configured.',
        'GOOGLE_SIGNIN_NOT_CONFIGURED',
      );
    }

    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(idToken, this.getJwks(), {
        issuer: GOOGLE_ISSUERS,
        audience: env.GOOGLE_CLIENT_ID,
      });
      payload = result.payload;
    } catch {
      throw new UnauthorizedError(
        'Invalid or expired Google sign-in token.',
        'GOOGLE_TOKEN_INVALID',
      );
    }

    const email = typeof payload.email === 'string' ? payload.email : null;
    // Google sends this as a real boolean in ID tokens, but tolerate the
    // string form too — it's a legacy OIDC quirk seen from some issuers.
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';

    if (!email || !emailVerified) {
      throw new UnauthorizedError(
        'Google account email is not verified.',
        'GOOGLE_TOKEN_INVALID',
      );
    }

    return { email: email.toLowerCase() };
  }
}

export const googleAuthService = new GoogleAuthService();
