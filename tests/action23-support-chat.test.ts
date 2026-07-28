import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 23 E2E: Support & Help Desk', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        firebaseUid: 'test-fb-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Support Test Bakery',
        ownerName: 'Alice Support',
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

  it('should successfully generate a pre-filled support WhatsApp link', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/support/chat',
      payload: {
        issueType: 'BILLING',
        message: 'My billing issue description goes here.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.whatsappUrl).toContain('https://wa.me/');
  });
});
