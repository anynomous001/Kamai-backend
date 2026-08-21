import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';
import { generateAccessToken } from '../src/modules/auth/jwt.service.js';
import { getISTCalendarDate } from '../src/shared/utils/ist-date.util.js';

// Isolated baker (not the shared 'test-baker-id' fixture) so these
// month-scoped sum/count assertions can never be polluted by orders
// created by other test files running against the shared fixture.
const BAKER_ID = 'test-baker-dashboard27-monthly';

describe('Action 27 E2E: Dashboard monthlyFinancials', () => {
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
        businessName: 'Monthly Financials Test Bakery',
        ownerName: 'Test Owner',
        status: 'ACTIVE',
        subscriptionStatus: 'ACTIVE',
      },
    });
    const token = await generateAccessToken({ sub: BAKER_ID, sessionId: 'test-session-27' });
    cookie = `kamai_access_token=${token}`;

    // A - Delivered, day 1 of this month, fully paid.
    const orderA = await prisma.order.create({
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
    await prisma.paymentEvent.create({
      data: { bakerId: BAKER_ID, orderId: orderA.id, amount: 1000, eventType: 'advance_received', paymentMode: 'CASH' },
    });

    // B - Delivered, last day of this month, partially paid.
    const orderB = await prisma.order.create({
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
    await prisma.paymentEvent.create({
      data: { bakerId: BAKER_ID, orderId: orderB.id, amount: 500, eventType: 'advance_received', paymentMode: 'UPI' },
    });

    // C - Confirmed (not Delivered), mid this month.
    const orderC = await prisma.order.create({
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
    await prisma.paymentEvent.create({
      data: { bakerId: BAKER_ID, orderId: orderC.id, amount: 300, eventType: 'advance_received', paymentMode: 'CASH' },
    });

    // D - Pending, mid this month, no payment at all.
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

    // F - Delivered, deliveryDate is LAST month, but the payment was
    // recorded THIS month - must NOT count in any deliveryDate-scoped
    // metric, but MUST count in advanceCollectedThisMonth (occurredAt-scoped).
    const orderF = await prisma.order.create({
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
    await prisma.paymentEvent.create({
      data: { bakerId: BAKER_ID, orderId: orderF.id, amount: 9999, eventType: 'advance_received', paymentMode: 'CASH' },
    });

    // G - Delivered, both deliveryDate AND payment are last month - must
    // not leak into any metric.
    const orderG = await prisma.order.create({
      data: {
        displayId: 'ORD-M27-G',
        baker: { connect: { id: BAKER_ID } },
        cakeCategory: 'Cake',
        cakeFlavour: 'Mango',
        deliveryType: 'pickup',
        deliveryDate: midPrevMonth,
        totalPrice: 500,
        advancePaid: 500,
        balanceDue: 0,
        orderStatus: 'Delivered',
        paymentStatus: 'Paid',
      },
    });
    await prisma.paymentEvent.create({
      data: {
        bakerId: BAKER_ID,
        orderId: orderG.id,
        amount: 500,
        eventType: 'advance_received',
        paymentMode: 'CASH',
        occurredAt: midPrevMonth,
        createdAt: midPrevMonth,
      },
    });
  }, 30000);

  afterAll(async () => {
    await prisma.baker.deleteMany({ where: { id: BAKER_ID } });
  });

  it('computes all 5 monthlyFinancials metrics correctly, excluding Cancelled orders and last-month data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/summary',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const mf = body.data.monthlyFinancials;

    expect(mf).toBeDefined();
    // Existing fields untouched by this change.
    expect(body.data.todayDeliveries).toBeDefined();
    expect(body.data.totalRevenue).toBeDefined();

    // A + B are the only Delivered orders with deliveryDate this month.
    expect(mf.deliveredThisMonth).toBe(2);
    expect(mf.amountSoldThisMonth).toBe(3000); // 1000 + 2000

    // A + B + C + D (non-cancelled, deliveryDate this month); E excluded
    // (Cancelled); F/G excluded (deliveryDate last month).
    expect(mf.expectedToBeSoldThisMonth).toBe(5300); // 1000 + 2000 + 1500 + 800

    // B(1500) + C(1200) + D(800); A has balanceDue 0; E excluded (Cancelled).
    expect(mf.dueThisMonth).toBe(3500);

    // A(1000) + B(500) + C(300) recorded this month, PLUS F(9999) whose
    // payment was recorded this month despite a last-month deliveryDate.
    // D has no payment. E has no payment. G's payment was recorded last
    // month, so it's excluded despite existing.
    expect(mf.advanceCollectedThisMonth).toBe(11799);
  });

  it('does not mix monthlyFinancials into the existing todaySnapshot fields', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/dashboard/summary',
      headers: { cookie },
    });

    const body = JSON.parse(res.body);
    expect(body.data.monthlyFinancials).not.toHaveProperty('todayDeliveries');
    expect(body.data).toHaveProperty('todayDeliveries');
    expect(body.data).toHaveProperty('monthlyFinancials');
  });
});
