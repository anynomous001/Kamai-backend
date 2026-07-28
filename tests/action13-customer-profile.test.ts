import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 13 E2E: Customer Profile', () => {
  let app: any;
  let customerId: string;

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
    await prisma.baker.create({
      data: {
        id: 'test-baker-id',
        firebaseUid: 'test-fb-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      }
    });

    const cust = await prisma.customer.create({
      data: {
        bakerId: 'test-baker-id',
        name: 'Bob Profile',
        phone: '+919876543213',
      },
    });
    customerId = cust.id;
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should return 200 and structured profile details with order history', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/customers/${customerId}`,
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Bob Profile');
    expect(body.data.orders).toBeDefined();
  });
});
