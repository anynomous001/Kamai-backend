import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { generateAccessToken } from '../src/modules/auth/jwt.service.js';
import { auditService } from '../src/shared/audit/index.js';
import type { FastifyInstance } from 'fastify';

describe('Action 24: Session-driven Logout & Session Revocation', () => {
  let app: FastifyInstance;
  let bakerId: string;
  let sessionId: string;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();

    bakerId = crypto.randomUUID();
    sessionId = crypto.randomUUID();

    // Clean test baker & sessions
    await prisma.baker.deleteMany({ where: { email: { contains: 'logout.test' } } });

    // Create test baker
    await prisma.baker.create({
      data: {
        id: bakerId,
        email: 'logout.test@example.com',
        status: 'ACTIVE',
      },
    });

    // Create test session (refresh token)
    await prisma.refreshToken.create({
      data: {
        id: sessionId,
        tokenHash: 'dummy-token-hash-12345',
        bakerId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterEach(async () => {
    await prisma.baker.deleteMany({ where: { email: { contains: 'logout.test' } } });
    await app.close();
    vi.restoreAllMocks();
  });

  it('should successfully revoke session in DB, clear HttpOnly cookies, and return success', async () => {
    const accessToken = await generateAccessToken({
      sub: bakerId,
      email: 'logout.test@example.com',
      sessionId,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: {
        kamai_access_token: accessToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Logged out successfully.');

    // Verify session in DB has revokedAt timestamp
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    });
    expect(tokenRecord?.revokedAt).not.toBeNull();

    // Verify access & refresh token cookies are cleared
    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const cookieStr = Array.isArray(cookies) ? cookies.join(';') : cookies;
    expect(cookieStr).toContain('kamai_access_token=;');
    expect(cookieStr).toContain('kamai_refresh_token=;');
  });

  it('should succeed even if audit logging fails (resilient audit failure handling)', async () => {
    const accessToken = await generateAccessToken({
      sub: bakerId,
      email: 'logout.test@example.com',
      sessionId,
    });

    // Mock audit logger to throw an error
    vi.spyOn(auditService, 'logEvent').mockRejectedValueOnce(new Error('Audit DB Down'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: {
        kamai_access_token: accessToken,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Logged out successfully.');

    // Session should still be revoked
    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { id: sessionId },
    });
    expect(tokenRecord?.revokedAt).not.toBeNull();
  });
});
