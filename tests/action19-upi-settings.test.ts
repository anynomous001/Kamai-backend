import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 19 E2E: Manage UPI Settings', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
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

  it('should successfully update UPI settings for a baker', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/baker/upi-settings',
      payload: {
        upiId: 'testbaker@okaxis',
        merchantName: 'Test Baker Merchant',
        preferredApps: ['Google Pay', 'PhonePe'],
        defaultCollectionMethod: 'UPI',
        generateDynamicQR: true,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.upiId).toBe('testbaker@okaxis');
    expect(body.data.merchantName).toBe('Test Baker Merchant');
  });
});
