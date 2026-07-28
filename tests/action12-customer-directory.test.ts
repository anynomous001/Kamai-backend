import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 12 E2E: Customer Directory', () => {
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

    await prisma.customer.create({
      data: {
        bakerId: 'test-baker-id',
        name: 'Alice Directory',
        phone: '+919876543212',
        lifetimeValue: 100000,
        totalOrders: 1,
      },
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should list customers and filter by search term', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/customers',
      query: {
        search: 'Alice',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.customers.length).toBeGreaterThanOrEqual(1);
    expect(body.data.customers[0].name).toBe('Alice Directory');
  });
});
