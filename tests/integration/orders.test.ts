import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/shared/database/prisma.js';
import { ordersService } from '../../src/modules/orders/orders.service.js';
import { v4 as uuidv4 } from 'uuid';

describe('Integration Tests: Orders & Customers Modules', () => {
  let testBakerId: string;

  beforeAll(async () => {
    // 1. Create a transient test baker record in the database
    const baker = await prisma.baker.create({
      data: {
        email: `test-${uuidv4()}@example.com`,
        phoneNumber: '9999999999',
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
        phone: '8888888888',
        address: '123 Baker Street',
      },
      delivery: {
        type: 'delivery' as const,
        date: '2026-10-31',
        time: '14:30',
      },
      cake: {
        category: 'Cake',
        flavour: 'Red Velvet',
        weightInPounds: 3.3,
      },
      payment: {
        totalPrice: 4500,
        advancePaid: 1500,
        paymentMethod: 'CASH' as const,
        forceConfirm: false,
      },
      referencePhotoUrl: null,
    };

    // Act: Create order using ordersService
    const result = await ordersService.createOrder(testBakerId, payload);

    expect(result.orderId).toBeDefined();
    expect(result.orderNumber).toBeDefined();
    expect(result.balanceDue).toBe(3000);
    expect(result.paymentStatus).toBe('Partially Paid');
    expect(result.status).toBe('Confirmed'); // advancePaid > 0 promotes Pending -> Confirmed

    // Assert: Check if customer is upserted
    const customer = await prisma.customer.findFirst({
      where: { bakerId: testBakerId, phone: '8888888888' },
    });
    expect(customer).toBeDefined();
    expect(customer?.name).toBe('John Test Integration');

    // Assert: Check database order record
    const dbOrder = await prisma.order.findUnique({
      where: { id: result.orderId },
    });
    expect(dbOrder).toBeDefined();
    expect(Number(dbOrder?.totalPrice)).toBe(4500);
    expect(Number(dbOrder?.advancePaid)).toBe(1500);
    expect(Number(dbOrder?.balanceDue)).toBe(3000);
  });

  it('should successfully query orders history with filtering and pagination', async () => {
    const query = {
      page: 1,
      limit: 10,
      status: 'Confirmed' as any,
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

    const details = await ordersService.getOrderDetails(testBakerId, list!.displayId);
    expect(details).toBeDefined();
    expect(details!.orderId).toBe(list!.displayId);
    expect(details!.customer.phone).toBe('8888888888');
    expect(details!.cake.flavour).toBe('Red Velvet');
  });
});
