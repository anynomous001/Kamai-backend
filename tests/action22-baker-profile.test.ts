import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 22 E2E: Baker Profile & Settings', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        firebaseUid: 'test-fb-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Profile Test Bakery',
        ownerName: 'Alice Profile',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      }
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should successfully retrieve the baker profile and settings DTO', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/baker/profile',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.business.businessName).toBe('Profile Test Bakery');
    expect(body.data.business.ownerName).toBe('Alice Profile');
  });
});
