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
        firebaseUid: 'test-fb-baker-id',
        phoneNumber: '+919999999999',
        businessName: 'Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      }
    });

    await prisma.order.create({
      data: {
        orderNumber: 'ORD-PAY-001',
        baker: { connect: { id: 'test-baker-id' } },
        category: 'Cake',
        weight: '2kg',
        flavour: 'Nutella',
        deliveryDate: new Date(),
        totalPrice: 200000,
        advancePaid: 50000,
        balanceDue: 150000,
        paymentStatus: 'PARTIALLY_PAID',
        customer: {
          create: {
            bakerId: 'test-baker-id',
            name: 'Payment Cust',
            phone: '+919999999996',
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
        amountReceived: 100000, // 1000 INR
        paymentMethod: 'UPI',
        transactionReference: 'TXN-1234',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.balanceDue).toBe(50000);
    expect(body.data.paymentStatus).toBe('PARTIALLY_PAID');
  });

  it('should successfully record final balance payment and mark as PAID', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/orders/ORD-PAY-001/payment',
      payload: {
        amountReceived: 50000, // remaining balance
        paymentMethod: 'CASH',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
    expect(body.data.balanceDue).toBe(0);
    expect(body.data.paymentStatus).toBe('PAID');
  });
});
