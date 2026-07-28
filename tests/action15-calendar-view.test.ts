import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 15 E2E: Calendar View', () => {
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

    // Create a delivery order scheduled for a specific date
    await prisma.order.create({
      data: {
        orderNumber: 'ORD-CAL-001',
        baker: { connect: { id: 'test-baker-id' } },
        category: 'Cake',
        weight: '1kg',
        flavour: 'Black Forest',
        deliveryDate: new Date('2026-08-15T15:00:00Z'),
        totalPrice: 100000,
        advancePaid: 50000,
        balanceDue: 50000,
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Calendar Cust',
            phone: '+919999999901',
          },
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should retrieve scheduled orders grouped by day for month views', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboard/calendar',
      query: {
        view: 'month',
        month: '2026-08',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.days).toBeDefined();
    // We scheduled for 2026-08-15, which will be in the days array
    const day15 = body.data.days.find((d: any) => d.date === '2026-08-15');
    expect(day15).toBeDefined();
    expect(day15.totalOrders).toBe(1);
  });
});
