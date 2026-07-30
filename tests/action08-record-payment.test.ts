import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

describe('Action 8 E2E: Record Balance Payment', () => {
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

    await prisma.order.create({
      data: {
        displayId: 'ORD-PAY-001',
        baker: { connect: { id: 'test-baker-id' } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Nutella',
        deliveryType: 'pickup',
        deliveryDate: new Date(),
        totalPrice: 2000,
        advancePaid: 500,
        balanceDue: 1500,
        orderStatus: 'Confirmed',
        paymentStatus: 'Partially Paid',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Payment Cust',
            phone: '9999999996',
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

  it('should successfully record a partial balance payment and update ledger', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-PAY-001/payment',
      payload: {
        amountReceived: 1000,
        paymentMethod: 'UPI',
        transactionReference: 'TXN-1234',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.balanceDue).toBe(500);
    expect(body.data.paymentStatus).toBe('Partially Paid');
  });

  it('should successfully record final balance payment and mark as Paid', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-PAY-001/payment',
      payload: {
        amountReceived: 500, // remaining balance
        paymentMethod: 'CASH',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.balanceDue).toBe(0);
    expect(body.data.paymentStatus).toBe('Paid');
  });
});
