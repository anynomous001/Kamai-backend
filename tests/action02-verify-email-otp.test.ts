import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { OtpService } from '../src/modules/auth/otp.service.js';
import type { FastifyInstance } from 'fastify';

describe('Action 2: Verify Email OTP & Tenant Provisioning', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();

    // Clean test records
    await prisma.emailVerification.deleteMany({
      where: { email: { contains: 'test' } },
    });
    await prisma.baker.deleteMany({
      where: { email: { contains: 'test' } },
    });
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('should verify OTP, provision new baker, seed materials, set auth cookies, and return isNew: true', async () => {
    const email = 'newbaker.test@example.com';
    const rawOtp = '483271';
    const otpHash = OtpService.hashOtp(rawOtp);

    // Insert verification record
    await prisma.emailVerification.create({
      data: {
        email,
        otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-otp',
      payload: { email, otp: rawOtp },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(true);
    expect(body.bakerId).toBeDefined();

    // Verify cookies set
    const cookies = response.cookies;
    expect(cookies.find((c) => c.name === 'kamai_access_token')).toBeDefined();
    expect(cookies.find((c) => c.name === 'kamai_refresh_token')).toBeDefined();

    // Verify Baker created in DB
    const baker = await prisma.baker.findUnique({ where: { email } });
    expect(baker).not.toBeNull();
    expect(baker?.status).toBe('PENDING_ONBOARDING');

    // Verify Default Materials seeded
    const materials = await prisma.investment.findMany({ where: { bakerId: baker?.id } });
    expect(materials.length).toBe(8);
  });

  it('should verify OTP for existing baker and return isNew: false', async () => {
    const email = 'existingbaker.test@example.com';
    const rawOtp = '123456';
    const otpHash = OtpService.hashOtp(rawOtp);

    // Create existing baker
    const existingBaker = await prisma.baker.create({
      data: {
        email,
        status: 'ACTIVE',
      },
    });

    // Insert verification record
    await prisma.emailVerification.create({
      data: {
        email,
        otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-otp',
      payload: { email, otp: rawOtp },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.isNew).toBe(false);
    expect(body.bakerId).toBe(existingBaker.id);
  });

  it('should return 401 Unauthorized for incorrect OTP and increment attempt count', async () => {
    const email = 'wrongotp.test@example.com';
    const rawOtp = '123456';

    const record = await prisma.emailVerification.create({
      data: {
        email,
        otpHash: OtpService.hashOtp(rawOtp),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-otp',
      payload: { email, otp: '999999' },
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);

    // Verify attempt count incremented
    const updatedRecord = await prisma.emailVerification.findUnique({
      where: { id: record.id },
    });
    expect(updatedRecord?.attempts).toBe(1);
  });

  it('should return 410 Gone for expired verification record', async () => {
    const email = 'expired.test@example.com';
    const rawOtp = '123456';

    await prisma.emailVerification.create({
      data: {
        email,
        otpHash: OtpService.hashOtp(rawOtp),
        expiresAt: new Date(Date.now() - 60 * 1000), // Expired 1 min ago
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-otp',
      payload: { email, otp: rawOtp },
    });

    expect(response.statusCode).toBe(410);
    const body = JSON.parse(response.body);
    expect(body.errorCode).toBe('OTP_EXPIRED');
  });

  it('should return 429 Too Many Requests when maximum attempts (5) are reached', async () => {
    const email = 'maxattempts.test@example.com';
    const rawOtp = '123456';

    await prisma.emailVerification.create({
      data: {
        email,
        otpHash: OtpService.hashOtp(rawOtp),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 5,
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-otp',
      payload: { email, otp: rawOtp },
    });

    expect(response.statusCode).toBe(429);
  });

  it('should prevent re-use of an already verified OTP', async () => {
    const email = 'reuse.test@example.com';
    const rawOtp = '123456';

    await prisma.emailVerification.create({
      data: {
        email,
        otpHash: OtpService.hashOtp(rawOtp),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        verifiedAt: new Date(), // Already verified
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email-otp',
      payload: { email, otp: rawOtp },
    });

    expect(response.statusCode).toBe(410);
  });
});
