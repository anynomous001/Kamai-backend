import type { Prisma } from '@prisma/client';

import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { NotFoundError, ConflictError } from '../../shared/errors/index.js';

type CustomerListRow = {
  customerId: string;
  displayId: string;
  name: string;
  phone: string | null;
  address: string | null;
  totalOrders: number;
  lifetimeValue: number;
  outstandingBalance: number;
  lastOrderDate: string | null;
};

function compareCustomers(
  a: CustomerListRow,
  b: CustomerListRow,
  sort: 'name' | 'lastOrderDate' | 'lifetimeValue' | 'totalOrders' | 'outstandingBalance',
  order: 'asc' | 'desc',
): number {
  let cmp = 0;
  if (sort === 'name') {
    cmp = a.name.localeCompare(b.name);
  } else if (sort === 'lastOrderDate') {
    const av = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : -Infinity;
    const bv = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : -Infinity;
    cmp = av - bv;
  } else {
    cmp = a[sort] - b[sort];
  }
  if (cmp === 0) cmp = a.name.localeCompare(b.name); // stable tie-break
  return order === 'asc' ? cmp : -cmp;
}

export class CustomersService {
  /**
   * Upserts a customer based on bakerId and phone.
   * If phone is null/omitted, a customer can never be deduplicated by
   * phone alone — a new customer row is always created (matches the
   * ~20-30% of real intake that has no phone captured).
   */
  async upsertCustomer(
    tx: Prisma.TransactionClient,
    bakerId: string,
    customerData: { name: string; phone: string | null; address?: string | null },
  ) {
    if (customerData.phone) {
      const existingCustomer = await tx.customer.findUnique({
        where: { bakerId_phone: { bakerId, phone: customerData.phone } },
      });

      if (existingCustomer) {
        const updatedCustomer = await tx.customer.update({
          where: { id: existingCustomer.id },
          data: { name: customerData.name, address: customerData.address },
        });

        await auditService.logEvent('CUSTOMER_UPDATED', updatedCustomer.id, {
          bakerId,
          customerId: updatedCustomer.id,
          phone: updatedCustomer.phone,
        });

        return updatedCustomer;
      }
    }

    const newCustomer = await tx.customer.create({
      data: {
        bakerId,
        name: customerData.name,
        phone: customerData.phone,
        address: customerData.address,
      },
    });

    await auditService.logEvent('CUSTOMER_CREATED', newCustomer.id, {
      bakerId,
      customerId: newCustomer.id,
      phone: newCustomer.phone,
    });

    return newCustomer;
  }

  /**
   * Retrieves a paginated and sortable list of customers for a baker.
   * totalOrders/lifetimeValue/outstandingBalance/lastOrderDate are always
   * computed from orders here — never stored on the customer row.
   * Cancelled orders are excluded from all of these, matching the
   * exclusion rule the old stored-metrics recalculation used to apply.
   */
  async getCustomers(bakerId: string, query: import('./customers.schemas.js').GetCustomersQuery) {
    const { page, limit, search, sort, order } = query;
    const pageVal = Number(page || 1);
    const limitVal = Number(limit || 20);
    const skip = (pageVal - 1) * limitVal;

    const where: Prisma.CustomerWhereInput = { bakerId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const totalItems = await prisma.customer.count({ where });

    const customers = await prisma.customer.findMany({
      where,
      select: { id: true, displayId: true, name: true, phone: true, address: true },
    });

    const customerIds = customers.map((c) => c.id);

    const [orderAgg, outstandingAgg] = await Promise.all([
      prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds }, orderStatus: { not: 'Cancelled' } },
        _count: { id: true },
        _sum: { totalPrice: true },
        _max: { deliveryDate: true },
      }),
      prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: customerIds }, orderStatus: { not: 'Cancelled' }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true },
      }),
    ]);

    const aggMap = new Map(orderAgg.map((a) => [a.customerId, a]));
    const outstandingMap = new Map(outstandingAgg.map((a) => [a.customerId, Number(a._sum.balanceDue ?? 0)]));

    const rows: CustomerListRow[] = customers.map((c) => {
      const agg = aggMap.get(c.id);
      return {
        customerId: c.id,
        displayId: c.displayId,
        name: c.name,
        phone: c.phone,
        address: c.address,
        totalOrders: agg?._count.id ?? 0,
        lifetimeValue: agg?._sum.totalPrice ? Number(agg._sum.totalPrice) : 0,
        outstandingBalance: outstandingMap.get(c.id) ?? 0,
        lastOrderDate: agg?._max.deliveryDate ? agg._max.deliveryDate.toISOString().slice(0, 10) : null,
      };
    });

    rows.sort((a, b) => compareCustomers(a, b, sort, order));

    const totalPages = Math.ceil(totalItems / limitVal);
    const paged = rows.slice(skip, skip + limitVal);

    return {
      customers: paged,
      pagination: {
        page: pageVal,
        limit: limitVal,
        totalItems,
        totalPages,
        hasNext: pageVal < totalPages,
        hasPrevious: pageVal > 1,
      },
    };
  }

  /**
   * Retrieves a complete customer CRM profile including paginated order history.
   */
  async getCustomerProfile(
    bakerId: string,
    customerId: string,
    query: import('./customers.schemas.js').GetCustomerProfileQuery,
  ) {
    const { page, limit } = query;
    const pageVal = Number(page || 1);
    const limitVal = Number(limit || 10);
    const skip = (pageVal - 1) * limitVal;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId, bakerId },
    });

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    const orderWhere: Prisma.OrderWhereInput = { customerId, bakerId };

    const totalItems = await prisma.order.count({ where: orderWhere });

    const ordersData = await prisma.order.findMany({
      where: orderWhere,
      skip,
      take: limitVal,
      orderBy: [{ deliveryDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        displayId: true,
        deliveryDate: true,
        orderStatus: true,
        totalPrice: true,
        balanceDue: true,
        paymentStatus: true,
      },
    });

    const summaryAgg = await prisma.order.aggregate({
      where: { customerId, bakerId, orderStatus: { not: 'Cancelled' } },
      _count: { id: true },
      _sum: { totalPrice: true },
      _max: { deliveryDate: true },
    });

    const outstandingAgg = await prisma.order.aggregate({
      where: { customerId, bakerId, orderStatus: { not: 'Cancelled' }, balanceDue: { gt: 0 } },
      _sum: { balanceDue: true },
    });

    const totalPages = Math.ceil(totalItems / limitVal);

    return {
      customerId: customer.id,
      displayId: customer.displayId,
      name: customer.name,
      phone: customer.phone,
      address: customer.address,
      notes: customer.notes,
      preferredDeliveryTime: customer.preferredDeliveryTime,
      summary: {
        totalOrders: summaryAgg._count.id,
        lifetimeValue: summaryAgg._sum.totalPrice ? Number(summaryAgg._sum.totalPrice) : 0,
        outstandingBalance: outstandingAgg._sum.balanceDue ? Number(outstandingAgg._sum.balanceDue) : 0,
        lastOrderDate: summaryAgg._max.deliveryDate ? summaryAgg._max.deliveryDate.toISOString().slice(0, 10) : null,
      },
      orders: ordersData.map((o) => ({
        orderId: o.id,
        orderNumber: o.displayId,
        deliveryDate: o.deliveryDate.toISOString().slice(0, 10),
        status: o.orderStatus,
        totalPrice: Number(o.totalPrice),
        balanceDue: Number(o.balanceDue),
        paymentStatus: o.paymentStatus,
      })),
      pagination: {
        page: pageVal,
        limit: limitVal,
        totalItems,
        totalPages,
        hasNext: pageVal < totalPages,
        hasPrevious: pageVal > 1,
      },
    };
  }

  /**
   * Updates a customer's contact info and CRM profile preferences.
   */
  async updateCustomer(
    bakerId: string,
    customerId: string,
    payload: import('./customers.schemas.js').UpdateCustomerBody,
  ) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId, bakerId },
    });

    if (!customer) {
      throw new NotFoundError('Customer not found');
    }

    if (payload.phone && payload.phone !== customer.phone) {
      const existingPhone = await prisma.customer.findUnique({
        where: { bakerId_phone: { bakerId, phone: payload.phone } },
      });

      if (existingPhone && existingPhone.id !== customerId) {
        throw new ConflictError('Customer with this phone already exists.');
      }
    }

    const changedFields: Record<string, { old: unknown; new: unknown }> = {};
    const updates: Partial<typeof payload> = {};

    for (const [key, newValue] of Object.entries(payload)) {
      const oldValue = (customer as any)[key];
      const normalizedNew = newValue ?? null;
      const normalizedOld = oldValue ?? null;

      if (normalizedNew !== normalizedOld) {
        changedFields[key] = { old: normalizedOld, new: normalizedNew };
        (updates as any)[key] = normalizedNew;
      }
    }

    if (Object.keys(updates).length === 0) {
      return {
        customerId: customer.id,
        displayId: customer.displayId,
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        notes: customer.notes,
        preferredDeliveryTime: customer.preferredDeliveryTime,
        updatedAt: customer.updatedAt.toISOString(),
      };
    }

    const updatedCustomer = await prisma.$transaction(async (tx) => {
      const result = await tx.customer.update({
        where: { id: customerId },
        data: updates,
      });

      await auditService.logEvent('CUSTOMER_UPDATED', customerId, {
        fieldsChanged: changedFields,
      });

      return result;
    });

    return {
      customerId: updatedCustomer.id,
      displayId: updatedCustomer.displayId,
      name: updatedCustomer.name,
      phone: updatedCustomer.phone,
      address: updatedCustomer.address,
      notes: updatedCustomer.notes,
      preferredDeliveryTime: updatedCustomer.preferredDeliveryTime,
      updatedAt: updatedCustomer.updatedAt.toISOString(),
    };
  }
}

export const customersService = new CustomersService();
