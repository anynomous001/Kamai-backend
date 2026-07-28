import { createHash } from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { generateRefreshToken } from '../src/modules/auth/jwt.service.js';
import { auditService } from '../src/shared/audit/index.js';
import type { FastifyInstance } from 'fastify';

/**
 * Action 25: Refresh Token Rotation & Reuse Detection
 *
 * Covers the industry-standard refresh flow implemented in
 * `authService.refreshSession`:
 *  - happy path rotation (old row revoked, new row + cookies issued)
 *  - reuse detection on an already-rotated (revoked) token → mass revoke
 *  - natural expiry (no mass revoke, just 401)
 *  - missing refresh cookie → 401
 */
describe('Action 25: Refresh Token Rotation & Reuse Detection', () => {
  let app: FastifyInstance;
  let bakerId: string;

  const testEmail = 'refresh.test@example.com';

  async function hashToken(token: string): Promise<string> {
    return createHash('sha256').update(token).digest('hex');
  }

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();

    bakerId = crypto.randomUUID();

    await prisma.baker.deleteMany({ where: { email: { contains: 'refresh.test' } } });

    await prisma.baker.create({
      data: {
        id: bakerId,
        email: testEmail,
        status: 'ACTIVE',
      },
    });
  });

  afterEach(async () => {
    await prisma.baker.deleteMany({ where: { email: { contains: 'refresh.test' } } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('should rotate a valid refresh token: revoke old row, issue new cookies + new DB row', async () => {
    const oldSessionId = crypto.randomUUID();
    const oldRefreshToken = await generateRefreshToken({
      sub: bakerId,
      email: testEmail,
      sessionId: oldSessionId,
    });

    await prisma.refreshToken.create({
      data: {
        id: oldSessionId,
        tokenHash: await hashToken(oldRefreshToken),
        bakerId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: {
        kamai_refresh_token: oldRefreshToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.bakerId).toBe(bakerId);

    // New cookies were set
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
    expect(cookieStr).toContain('kamai_access_token=');
    expect(cookieStr).toContain('kamai_refresh_token=');

    // Old row is now revoked
    const oldRecord = await prisma.refreshToken.findUnique({ where: { id: oldSessionId } });
    expect(oldRecord?.revokedAt).not.toBeNull();

    // Exactly one new, non-revoked row now exists for this baker
    const activeRows = await prisma.refreshToken.findMany({
      where: { bakerId, revokedAt: null },
    });
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0]?.id).not.toBe(oldSessionId);
  });

  it('should detect reuse of an already-rotated refresh token and revoke ALL sessions', async () => {
    const auditSpy = vi.spyOn(auditService, 'logEvent');

    const rotatedSessionId = crypto.randomUUID();
    const rotatedRefreshToken = await generateRefreshToken({
      sub: bakerId,
      email: testEmail,
      sessionId: rotatedSessionId,
    });

    // Simulate a token that was already rotated out (revokedAt set)
    await prisma.refreshToken.create({
      data: {
        id: rotatedSessionId,
        tokenHash: await hashToken(rotatedRefreshToken),
        bakerId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: new Date(Date.now() - 60 * 1000),
      },
    });

    // A second, currently-active, unrelated session for the same baker
    const otherSessionId = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: {
        id: otherSessionId,
        tokenHash: 'unrelated-active-session-hash',
        bakerId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: {
        kamai_refresh_token: rotatedRefreshToken,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('REFRESH_TOKEN_INVALID');

    // Every session for the baker — including the unrelated one — is now revoked
    const remainingActive = await prisma.refreshToken.findMany({
      where: { bakerId, revokedAt: null },
    });
    expect(remainingActive).toHaveLength(0);

    expect(auditSpy).toHaveBeenCalledWith(
      'REFRESH_TOKEN_REUSE_DETECTED',
      bakerId,
      expect.objectContaining({ reason: 'token_already_revoked' }),
    );
  });

  it('should return 401 without mass-revoking sessions on natural expiry', async () => {
    const expiredSessionId = crypto.randomUUID();
    const expiredRefreshToken = await generateRefreshToken({
      sub: bakerId,
      email: testEmail,
      sessionId: expiredSessionId,
    });

    await prisma.refreshToken.create({
      data: {
        id: expiredSessionId,
        tokenHash: await hashToken(expiredRefreshToken),
        bakerId,
        // Already past expiry per the DB record (natural expiry, not reuse)
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    // A second, unrelated active session that must survive natural expiry handling
    const otherSessionId = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: {
        id: otherSessionId,
        tokenHash: 'unrelated-active-session-hash-2',
        bakerId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: {
        kamai_refresh_token: expiredRefreshToken,
      },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('REFRESH_TOKEN_EXPIRED');

    // Natural expiry must NOT trigger a mass revoke of other sessions
    const otherRecord = await prisma.refreshToken.findUnique({ where: { id: otherSessionId } });
    expect(otherRecord?.revokedAt).toBeNull();
  });

  it('should return 401 when the refresh token cookie is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('REFRESH_TOKEN_INVALID');
  });
});
