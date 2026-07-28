import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/shared/database/prisma.js';
import { ordersService } from '../../src/modules/orders/orders.service.js';
import { customersService } from '../../src/modules/customers/customers.service.js';
import { v4 as uuidv4 } from 'uuid';

describe('Integration Tests: Orders & Customers Modules', () => {
  let testBakerId: string;
  const testFirebaseUid = `test-fb-${uuidv4()}`;

  beforeAll(async () => {
    // 1. Create a transient test baker record in the database
    const baker = await prisma.baker.create({
      data: {
        firebaseUid: testFirebaseUid,
        phoneNumber: '+919999999999',
        businessName: 'Integration Test Bakery',
        ownerName: 'Integration Tester',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });
    testBakerId = baker.id;
  });

  afterAll(async () => {
    // 2. Cascade delete the test baker which cleans up all transient orders, customers, etc.
    if (testBakerId) {
      await prisma.baker.delete({
        where: { id: testBakerId },
      });
    }
  });

  it('should successfully create an order and automatically upsert a customer', async () => {
    const payload = {
      customer: {
        name: 'John Test Integration',
        phone: '+918888888888',
        address: '123 Baker Street',
      },
      delivery: {
        date: '2026-10-31',
        time: '14:30',
      },
      cake: {
        category: 'Cake',
        weight: '1.5kg',
        flavour: 'Red Velvet',
      },
      payment: {
        totalPrice: 450000, // 4500 INR in paise
        advancePaid: 150000, // 1500 INR in paise
      },
      referencePhoto: null,
    };

    // Act: Create order using ordersService
    const result = await ordersService.createOrder(testBakerId, payload);

    expect(result.orderId).toBeDefined();
    expect(result.orderNumber).toBeDefined();
    expect(result.balanceDue).toBe(300000);
    expect(result.paymentStatus).toBe('PARTIALLY_PAID');
    expect(result.status).toBe('PENDING');

    // Assert: Check if customer is upserted
    const customer = await prisma.customer.findFirst({
      where: { bakerId: testBakerId, phone: '+918888888888' },
    });
    expect(customer).toBeDefined();
    expect(customer?.name).toBe('John Test Integration');

    // Assert: Check database order record
    const dbOrder = await prisma.order.findUnique({
      where: { id: result.orderId },
    });
    expect(dbOrder).toBeDefined();
    expect(dbOrder?.totalPrice).toBe(450000);
    expect(dbOrder?.advancePaid).toBe(150000);
    expect(dbOrder?.balanceDue).toBe(300000);
  });

  it('should successfully query orders history with filtering and pagination', async () => {
    const query = {
      page: 1,
      limit: 10,
      status: 'PENDING' as any,
    };

    const history = await ordersService.getOrders(testBakerId, query);
    expect(history.orders).toBeDefined();
    expect(history.orders.length).toBeGreaterThanOrEqual(1);
    expect(history.pagination.totalItems).toBeGreaterThanOrEqual(1);
  });

  it('should retrieve order details', async () => {
    // 1. Get first order
    const list = await prisma.order.findFirst({
      where: { bakerId: testBakerId },
    });
    expect(list).toBeDefined();

    const details = await ordersService.getOrderDetails(testBakerId, list!.orderNumber);
    expect(details).toBeDefined();
    expect(details!.orderId).toBe(list!.orderNumber);
    expect(details!.customer.phone).toBe('+918888888888');
    expect(details!.cake.flavour).toBe('Red Velvet');
  });
});
