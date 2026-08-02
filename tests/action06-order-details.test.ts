import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 6 E2E: View Order Details', () => {
  let app: any;
  let createdOrderId: string;

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

    const createdOrder = await prisma.order.create({
      data: {
        displayId: 'ORD-DTL-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Pineapple',
        weightInPounds: 3.3,
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 1200,
        advancePaid: 600,
        balanceDue: 600,
        orderStatus: 'Confirmed',
        paymentStatus: 'Partially Paid',
        customFields: [{ label: 'Cake Message', value: 'Happy Birthday!' }],
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'John Pineapple',
            phone: '9999999994',
          },
        },
      },
    });
    createdOrderId = createdOrder.id;
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({
      where: { id: 'test-baker-id' },
    });
  });

  it('should successfully retrieve detailed order details by orderNumber', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/ORD-DTL-001',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.orderId).toBe('ORD-DTL-001');
    expect(body.data.cake.flavour).toBe('Pineapple');
  });

  it('exposes the internal UUID as `id`, distinct from the display-id `orderId` field (regression: id was previously missing, forcing the frontend to guess or re-fetch from the list endpoint)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/ORD-DTL-001',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.id).toBe(createdOrderId);
    expect(body.data.id).not.toBe(body.data.orderId);
  });

  it('should return customFields label/value content intact (regression: response schema previously stripped it to {})', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/ORD-DTL-001',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.data.customFields).toEqual([{ label: 'Cake Message', value: 'Happy Birthday!' }]);
  });

  it('should return 404 for non-existent order number', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/orders/ORD-NONEXISTENT',
    });

    expect(response.statusCode).toBe(404);
  });
});
