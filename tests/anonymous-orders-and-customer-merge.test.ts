import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/shared/database/prisma.js';

// Covers the two audit-driven fixes implemented together on
// audit/duplicate-customer-order-edit:
//   Issue A - the phone-conflict guard in updateOrder blocked a legitimate
//     correction (filling in a previously-missing phone that turns out to
//     belong to the same real person under a different blank-phone
//     record) exactly the same as a genuine mistake (reassigning an
//     already-set phone to someone else's number). Now only the latter
//     stays blocked; the former auto-merges.
//   Issue B - Order.customerId is nullable; a fully anonymous walk-in sale
//     (no name, no phone) skips customer-record creation entirely.
describe('Anonymous orders and customer auto-merge on edit', () => {
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
      },
    });
  });

  afterAll(async () => {
    await prisma.baker.deleteMany({ where: { id: 'test-baker-id' } });
  });

  const basePayload = {
    cake: { category: 'Cake', flavour: 'Vanilla' },
    delivery: { type: 'pickup', date: '2026-12-01', time: '10:00' },
    payment: { totalPrice: 1000, advancePaid: 0 },
  };

  it('creates a fully anonymous order (no name, no phone) with no linked customer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        ...basePayload,
        customer: { phone: null },
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    const order = await prisma.order.findFirst({
      where: { displayId: body.data.orderNumber, bakerId: 'test-baker-id' },
    });
    expect(order).toBeDefined();
    expect(order!.customerId).toBeNull();

    const customerCount = await prisma.customer.count({ where: { bakerId: 'test-baker-id' } });
    expect(customerCount).toBe(0);
  });

  it('creates a customer when a previously-anonymous order is edited to add a name and phone', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        ...basePayload,
        customer: { phone: null },
      },
    });
    const orderNumber = JSON.parse(createRes.body).data.orderNumber;

    const order = await prisma.order.findFirst({ where: { displayId: orderNumber, bakerId: 'test-baker-id' } });
    expect(order!.customerId).toBeNull();

    const editRes = await app.inject({
      method: 'PUT',
      url: `/api/orders/${orderNumber}`,
      payload: {
        ...basePayload,
        customer: { name: 'Newly Named Customer', phone: '9444444444', address: 'Some Address' },
      },
    });

    expect(editRes.statusCode).toBe(200);

    const updatedOrder = await prisma.order.findFirst({
      where: { displayId: orderNumber, bakerId: 'test-baker-id' },
      include: { customer: true },
    });
    expect(updatedOrder!.customerId).not.toBeNull();
    expect(updatedOrder!.customer!.name).toBe('Newly Named Customer');
    expect(updatedOrder!.customer!.phone).toBe('9444444444');
  });

  it('auto-merges when a blank phone is filled in and matches a different existing customer, cleaning up the now-empty orphan', async () => {
    // Order A: same real customer, no phone captured -> customer C1
    const resA = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { ...basePayload, customer: { name: 'Merge Test Customer', phone: null } },
    });
    const orderNumberA = JSON.parse(resA.body).data.orderNumber;
    const orderA = await prisma.order.findFirst({ where: { displayId: orderNumberA, bakerId: 'test-baker-id' } });
    const customerIdC1 = orderA!.customerId!;

    // Order B: same real customer, this time with a phone -> customer C2 (new, since C1 has no phone to match on)
    const resB = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { ...basePayload, customer: { name: 'Merge Test Customer', phone: '9555555555' } },
    });
    const orderNumberB = JSON.parse(resB.body).data.orderNumber;
    const orderB = await prisma.order.findFirst({ where: { displayId: orderNumberB, bakerId: 'test-baker-id' } });
    const customerIdC2 = orderB!.customerId!;
    expect(customerIdC2).not.toBe(customerIdC1);

    // Edit order A to add the same phone C2 already has -> should auto-merge onto C2, not block
    const editRes = await app.inject({
      method: 'PUT',
      url: `/api/orders/${orderNumberA}`,
      payload: { ...basePayload, customer: { name: 'Merge Test Customer', phone: '9555555555' } },
    });

    expect(editRes.statusCode).toBe(200);

    const updatedOrderA = await prisma.order.findFirst({ where: { displayId: orderNumberA, bakerId: 'test-baker-id' } });
    expect(updatedOrderA!.customerId).toBe(customerIdC2);

    // C1 had exactly one order (A), now reassigned - it should be gone
    const c1 = await prisma.customer.findUnique({ where: { id: customerIdC1 } });
    expect(c1).toBeNull();

    // C2 should be untouched (decision: don't overwrite the existing customer's own fields)
    const c2 = await prisma.customer.findUnique({ where: { id: customerIdC2 } });
    expect(c2).not.toBeNull();
    expect(c2!.name).toBe('Merge Test Customer');
    expect(c2!.phone).toBe('9555555555');

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: 'CUSTOMER_AUTO_MERGED_ON_EDIT', entityId: customerIdC2 },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditEntry).not.toBeNull();
    const metadata = auditEntry!.metadata as any;
    expect(metadata.mergedFromCustomerId).toBe(customerIdC1);
    expect(metadata.mergedIntoCustomerId).toBe(customerIdC2);
    expect(metadata.orphanDeleted).toBe(true);
  });

  it('still blocks reassigning an already-set phone to a different existing customer', async () => {
    const resC = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { ...basePayload, customer: { name: 'Blocked Test One', phone: '9666666666' } },
    });
    const orderNumberC = JSON.parse(resC.body).data.orderNumber;

    await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: { ...basePayload, customer: { name: 'Blocked Test Two', phone: '9777777777' } },
    });

    // Order C already has its own phone (9666666666, non-null) - attempting to
    // reassign it to a DIFFERENT existing customer's phone must stay blocked.
    const editRes = await app.inject({
      method: 'PUT',
      url: `/api/orders/${orderNumberC}`,
      payload: { ...basePayload, customer: { name: 'Blocked Test One', phone: '9777777777' } },
    });

    expect(editRes.statusCode).toBe(409);
    const body = JSON.parse(editRes.body);
    expect(body.message).toBe('Customer with this phone number already exists.');

    // Order C must remain untouched - still linked to its original customer/phone
    const orderC = await prisma.order.findFirst({
      where: { displayId: orderNumberC, bakerId: 'test-baker-id' },
      include: { customer: true },
    });
    expect(orderC!.customer!.phone).toBe('9666666666');
  });
});
