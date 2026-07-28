import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { OtpService } from '../src/modules/auth/otp.service.js';
import type { FastifyInstance } from 'fastify';

describe('Action 1: Send Email Verification OTP', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();

    // Clean test email verifications
    await prisma.emailVerification.deleteMany({
      where: { email: { contains: 'test' } },
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('should generate, hash, and store OTP, then return 200 OK for a valid email', async () => {
    const email = 'baker.test@example.com';

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      payload: { email },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.message).toBe('Verification code sent successfully.');
    expect(body.expiresIn).toBe(300);

    // Verify record in database
    const record = await prisma.emailVerification.findFirst({
      where: { email },
    });

    expect(record).not.toBeNull();
    expect(record?.email).toBe(email);
    expect(record?.otpHash).toBeDefined();
    expect(record?.attempts).toBe(0);
  });

  it('should normalize mixed-case email addresses to lowercase before storing', async () => {
    const mixedEmail = 'Owner.Test@Example.com';

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      payload: { email: mixedEmail },
    });

    expect(response.statusCode).toBe(200);

    const record = await prisma.emailVerification.findFirst({
      where: { email: 'owner.test@example.com' },
    });

    expect(record).not.toBeNull();
    expect(record?.email).toBe('owner.test@example.com');
  });

  it('should return 422 Bad Request for invalid email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      payload: { email: 'invalid-email-string' },
    });

    expect(response.statusCode).toBe(422);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
  });

  it('should enforce 60-second cooldown rate limit between consecutive requests', async () => {
    const email = 'cooldown.test@example.com';

    // First request - success
    const firstRes = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      payload: { email },
    });
    expect(firstRes.statusCode).toBe(200);

    // Immediate second request - rate limited
    const secondRes = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      payload: { email },
    });

    expect(secondRes.statusCode).toBe(429);
    const body = JSON.parse(secondRes.body);
    expect(body.message).toContain('Please wait 60 seconds');
  });

  it('should enforce hourly rate limit of maximum 5 requests', async () => {
    const email = 'hourly.test@example.com';
    const now = new Date();

    // Insert 5 previous verification records within the last hour
    for (let i = 0; i < 5; i++) {
      const rec = await prisma.emailVerification.create({
        data: {
          email,
          otpHash: OtpService.hashOtp('123456'),
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
      });

      // Explicitly update createdAt to past timestamp (> 2 mins ago) to avoid cooldown conflict
      await prisma.emailVerification.update({
        where: { id: rec.id },
        data: {
          createdAt: new Date(now.getTime() - (i + 2) * 3 * 60 * 1000),
        },
      });
    }

    // 6th request should fail due to hourly rate limit
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/send-email-otp',
      payload: { email },
    });

    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.message).toContain('Too many verification code requests');
  });
});
