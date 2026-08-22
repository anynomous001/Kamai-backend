import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { generateAccessToken } from '../src/modules/auth/jwt.service.js';
import { getISTCalendarDate } from '../src/shared/utils/ist-date.util.js';

// Isolated baker (not the shared 'test-baker-id' fixture) so these
// month-scoped sum/count assertions can never be polluted by orders
// created by other test files running against the shared fixture.
const BAKER_ID = 'test-baker-dashboard27-monthly';

describe('Action 27 E2E: Dashboard metrics (redesigned 4-card grid)', () => {
  let app: any;
  let cookie: string;

  const { year, month } = getISTCalendarDate();
  // Mirrors dashboard.service.ts's own month-bound math exactly.
  const firstOfThisMonth = new Date(Date.UTC(year, month, 1));
  const lastOfThisMonth = new Date(Date.UTC(year, month + 1, 0));
  const midThisMonth = new Date(Date.UTC(year, month, 15));
  const lastOfPrevMonth = new Date(Date.UTC(year, month, 0));
  const midPrevMonth = new Date(Date.UTC(year, month - 1, 15));

  beforeAll(async () => {
    app = await buildApp();
    await prisma.baker.deleteMany({ where: { id: BAKER_ID } });
    await prisma.baker.create({
      data: {
        id: BAKER_ID,
        phoneNumber: '+919999900027',
        businessName: 'Monthly Metrics Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });
    const token = await generateAccessToken({ sub: BAKER_ID, sessionId: 'test-session-27' });
    cookie = `kamai_access_token=${token}`;

    // A - Delivered, day 1 of this month.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-A',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Vanilla',
        deliveryType: 'pickup',
        deliveryDate: firstOfThisMonth,
        totalPrice: 1000,
        advancePaid: 1000,
        balanceDue: 0,
        orderStatus: 'Delivered',
        paymentStatus: 'Paid',
      },
    });

    // B - Delivered, last day of this month.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-B',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Chocolate',
        deliveryType: 'delivery',
        deliveryDate: lastOfThisMonth,
        totalPrice: 2000,
        advancePaid: 500,
        balanceDue: 1500,
        orderStatus: 'Delivered',
        paymentStatus: 'Partially Paid',
      },
    });

    // C - Confirmed (not Delivered), mid this month.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-C',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Red Velvet',
        deliveryType: 'pickup',
        deliveryDate: midThisMonth,
        totalPrice: 1500,
        advancePaid: 300,
        balanceDue: 1200,
        orderStatus: 'Confirmed',
        paymentStatus: 'Partially Paid',
      },
    });

    // D - Pending, mid this month.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-D',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Butterscotch',
        deliveryType: 'pickup',
        deliveryDate: midThisMonth,
        totalPrice: 800,
        advancePaid: 0,
        balanceDue: 800,
        orderStatus: 'Pending',
        paymentStatus: 'Unpaid',
      },
    });

    // E - Cancelled, mid this month, must be excluded from every metric.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-E',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Pineapple',
        deliveryType: 'pickup',
        deliveryDate: midThisMonth,
        totalPrice: 5000,
        advancePaid: 0,
        balanceDue: 5000,
        orderStatus: 'Cancelled',
        paymentStatus: 'Unpaid',
      },
    });

    // F - Delivered, but deliveryDate is LAST month - must not leak into
    // any this-month metric despite being a large amount.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-F',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Coffee',
        deliveryType: 'pickup',
        deliveryDate: lastOfPrevMonth,
        totalPrice: 9999,
        advancePaid: 9999,
        balanceDue: 0,
        orderStatus: 'Delivered',
        paymentStatus: 'Paid',
      },
    });

    // G - Confirmed, deliveryDate mid LAST month - must not leak into
    // confirmedOrdersCount/confirmedRevenue/confirmedBalanceDue.
    await prisma.order.create({
      data: {
        displayId: 'ORD-M27-G',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Mango',
        deliveryType: 'pickup',
        deliveryDate: midPrevMonth,
        totalPrice: 500,
        advancePaid: 0,
        balanceDue: 500,
        orderStatus: 'Confirmed',
        paymentStatus: 'Unpaid',
      },
    });

    // Expense ledger (Investment model) - two entries this month, one last
    // month (excluded), one soft-deleted this month (excluded).
    await prisma.investment.create({
      data: {
        baker: { connect: { id: BAKER_ID } },
        purchaseDate: midThisMonth,
        category: 'ingredients',
        materialName: 'Flour',
        quantity: 10,
        unit: 'kg',
        pricePerUnit: 120,
        totalCost: 1200,
      },
    });
    await prisma.investment.create({
      data: {
        baker: { connect: { id: BAKER_ID } },
        purchaseDate: midThisMonth,
        category: 'packaging',
        materialName: 'Boxes',
        quantity: 25,
        unit: 'piece',
        pricePerUnit: 15,
        totalCost: 375,
      },
    });
    await prisma.investment.create({
      data: {
        baker: { connect: { id: BAKER_ID } },
        purchaseDate: midPrevMonth,
        category: 'ingredients',
        materialName: 'Sugar',
        quantity: 20,
        unit: 'kg',
        pricePerUnit: 45,
        totalCost: 900,
      },
    });
    await prisma.investment.create({
      data: {
        baker: { connect: { id: BAKER_ID } },
        purchaseDate: midThisMonth,
        category: 'equipment',
        materialName: 'Mixer (returned)',
        quantity: 1,
        unit: 'piece',
        pricePerUnit: 5000,
        totalCost: 5000,
        deletedAt: new Date(),
      },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.baker.deleteMany({ where: { id: BAKER_ID } });
  });

  it('computes all 4 dashboard metric-card figures correctly, excluding Cancelled orders, last-month data, and soft-deleted expenses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/summary',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const m = body.data.metrics;

    expect(m).toBeDefined();

    // Card 1 — A, B, C, D (non-cancelled, deliveryDate this month); E
    // excluded (Cancelled), F/G excluded (deliveryDate last month).
    expect(m.totalOrdersThisMonth).toBe(4);
    expect(m.confirmedOrdersCount).toBe(1); // C only (G is last month)
    expect(m.pendingOrdersCount).toBe(1); // D only

    // Card 2 — confirmedRevenue = C(1500); deliveredRevenue = A+B(3000).
    expect(m.confirmedRevenue).toBe(1500);
    expect(m.deliveredRevenue).toBe(3000);
    expect(m.expectedRevenueThisMonth).toBe(4500);
    expect(m.confirmedBalanceDue).toBe(1200); // C's balanceDue only

    // Card 3 — Pending order value = D(800).
    expect(m.pendingOrderValue).toBe(800);

    // Card 4 — 1200 + 375 this month; 900 (last month) and 5000
    // (soft-deleted) both excluded.
    expect(m.totalInvestedThisMonth).toBe(1575);
  });

  it('leaves todayOrders and upcomingOrders (Priority: Bake Today / Upcoming sections) untouched by this change', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/summary',
      headers: { cookie },
    });

    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('todayOrders');
    expect(body.data).toHaveProperty('upcomingOrders');
    expect(Array.isArray(body.data.todayOrders)).toBe(true);
    // The old fields the removed cards/section used to read are gone.
    expect(body.data).not.toHaveProperty('monthlyFinancials');
    expect(body.data).not.toHaveProperty('todayDeliveries');
    expect(body.data).not.toHaveProperty('activeOrders');
    expect(body.data).not.toHaveProperty('outstandingBalance');
    expect(body.data).not.toHaveProperty('totalRevenue');
  });
});
