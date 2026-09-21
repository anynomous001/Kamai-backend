import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { googleAuthService } from '../src/modules/auth/google-auth.service.js';
import { auditService } from '../src/shared/audit/index.js';
import { UnauthorizedError } from '../src/shared/errors/index.js';
import type { FastifyInstance } from 'fastify';

/**
 * Action 28: Google Sign-In (Baker Operations, additive to email OTP)
 *
 * googleAuthService.verifyIdToken is mocked throughout — this suite
 * exercises signInWithGoogle's own logic (find-or-create by email,
 * suspension gating, session issuance parity with OTP), not whether
 * Google's JWKS endpoint itself is reachable. No GOOGLE_CLIENT_ID is
 * configured in the test environment; mocking the verification call
 * entirely bypasses that check, exactly as intended for a credential
 * that doesn't exist yet in any environment.
 */
describe('Action 28: Google Sign-In', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();

    await prisma.baker.deleteMany({ where: { email: { contains: 'googlesignin.test' } } });
  });

  afterEach(async () => {
    await prisma.baker.deleteMany({ where: { email: { contains: 'googlesignin.test' } } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('should provision a new baker on first Google sign-in, seed default materials, and set auth cookies', async () => {
    const email = 'newgooglesignin.test@example.com';
    vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({ email });
    const auditSpy = vi.spyOn(auditService, 'logEvent');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'fake-google-id-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(true);
    expect(body.bakerId).toBeDefined();

    const cookies = response.cookies;
    expect(cookies.find((c) => c.name === 'kamai_access_token')).toBeDefined();
    expect(cookies.find((c) => c.name === 'kamai_refresh_token')).toBeDefined();

    // Exactly one Baker row, correct default status.
    const bakers = await prisma.baker.findMany({ where: { email } });
    expect(bakers).toHaveLength(1);
    expect(bakers[0]?.status).toBe('PENDING_ONBOARDING');
    expect(bakers[0]?.id).toBe(body.bakerId);

    // Same tenant provisioning as a brand-new OTP signup (TenantService.provisionTenant).
    const materials = await prisma.investment.findMany({ where: { bakerId: body.bakerId } });
    expect(materials.length).toBe(8);

    expect(auditSpy).toHaveBeenCalledWith(
      'GOOGLE_SIGNIN_NEW_TENANT',
      body.bakerId,
      expect.objectContaining({ email, isNew: true }),
    );
  });

  it('should log into an existing baker (originally created via OTP) without creating a duplicate', async () => {
    const email = 'existinggooglesignin.test@example.com';
    const existingBaker = await prisma.baker.create({
      data: { email, status: 'ACTIVE' },
    });

    vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({ email });
    const auditSpy = vi.spyOn(auditService, 'logEvent');

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'fake-google-id-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.isNew).toBe(false);
    expect(body.bakerId).toBe(existingBaker.id);

    const bakers = await prisma.baker.findMany({ where: { email } });
    expect(bakers).toHaveLength(1);

    expect(auditSpy).toHaveBeenCalledWith(
      'GOOGLE_SIGNIN_SUCCESS',
      existingBaker.id,
      expect.objectContaining({ email, isNew: false }),
    );
  });

  it('should issue a session that behaves identically to an OTP-issued one through the refresh endpoint', async () => {
    const email = 'refreshparity.googlesignin.test@example.com';
    vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({ email });

    const signInResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'fake-google-id-token' },
    });
    expect(signInResponse.statusCode).toBe(200);

    const refreshCookie = signInResponse.cookies.find((c) => c.name === 'kamai_refresh_token');
    expect(refreshCookie).toBeDefined();

    // A Google-issued refresh token must rotate through the exact same
    // authService.refreshSession path (and its race-condition fix) as any
    // other session — there's no separate code path to diverge from.
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { kamai_refresh_token: refreshCookie!.value },
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshBody = JSON.parse(refreshResponse.body);
    expect(refreshBody.success).toBe(true);
  });

  it('should reject Google sign-in for a suspended baker, the same way refresh already does', async () => {
    const email = 'suspendedgooglesignin.test@example.com';
    await prisma.baker.create({ data: { email, status: 'SUSPENDED' } });

    vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({ email });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'fake-google-id-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.cookies.find((c) => c.name === 'kamai_access_token')).toBeUndefined();

    // Still exactly one row — no session-bearing duplicate was created.
    const bakers = await prisma.baker.findMany({ where: { email } });
    expect(bakers).toHaveLength(1);
  });

  it('should return a clean 401 and create no session for an invalid/expired Google ID token', async () => {
    vi.spyOn(googleAuthService, 'verifyIdToken').mockRejectedValue(
      new UnauthorizedError('Invalid or expired Google sign-in token.', 'GOOGLE_TOKEN_INVALID'),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { idToken: 'garbage' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.cookies.find((c) => c.name === 'kamai_access_token')).toBeUndefined();
  });

  it('should return 422 when idToken is missing from the request body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: {},
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('VALIDATION_ERROR');
  });
});
