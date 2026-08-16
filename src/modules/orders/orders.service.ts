import { prisma } from '../../shared/database/prisma.js';
import { customersService } from '../customers/customers.service.js';
import { cacheService } from '../../shared/cache/index.js';
import { auditService } from '../../shared/audit/index.js';
import { financeService } from '../finance/finance.service.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/index.js';

import { statusValidationService, type OrderStatusValue } from './status-validation.service.js';
import type { CreateOrderPayload, RecordPaymentBody, UpdateOrderBody } from './orders.schemas.js';

type PaymentStatusValue = 'Unpaid' | 'Partially Paid' | 'Paid';

/**
 * Derives {orderStatus, paymentStatus} from totalPrice/advancePaid.
 * Matches the spec exactly:
 *  - advancePaid > 0 and < totalPrice -> Confirmed / Partially Paid
 *  - advancePaid = 0, not forceConfirmed -> Pending / Unpaid
 *  - advancePaid = 0, forceConfirmed -> Confirmed / Unpaid
 *  - advancePaid = totalPrice -> Confirmed / Paid
 *  - advancePaid > totalPrice -> reject, never a stored state
 *
 * `currentOrderStatus` lets this be reused for existing orders: payment can
 * only ever PROMOTE order_status (Pending -> Confirmed), never regress an
 * order already further along the production lifecycle (In Progress/Ready/
 * Delivered) or touch a Cancelled order.
 */
function derivePaymentState(
  totalPrice: number,
  advancePaid: number,
  forceConfirm: boolean,
  currentOrderStatus?: OrderStatusValue,
): { orderStatus: OrderStatusValue; paymentStatus: PaymentStatusValue } {
  if (advancePaid > totalPrice) {
    throw new BadRequestError('Advance paid cannot exceed total price.');
  }

  const paymentStatus: PaymentStatusValue =
    advancePaid === 0 ? 'Unpaid' : advancePaid === totalPrice ? 'Paid' : 'Partially Paid';

  const shouldBeAtLeastConfirmed = advancePaid > 0 || forceConfirm;
  const alreadyProgressed =
    currentOrderStatus === 'In Progress' ||
    currentOrderStatus === 'Ready' ||
    currentOrderStatus === 'Delivered' ||
    currentOrderStatus === 'Cancelled';

  let orderStatus: OrderStatusValue;
  if (alreadyProgressed) {
    orderStatus = currentOrderStatus as OrderStatusValue;
  } else {
    orderStatus = shouldBeAtLeastConfirmed ? 'Confirmed' : 'Pending';
  }

  return { orderStatus, paymentStatus };
}

export class OrdersService {
  /**
   * Creates a new order and upserts the customer within a single transaction.
   */
  async createOrder(bakerId: string, payload: CreateOrderPayload) {
    return prisma.$transaction(async (tx) => {
      const total = payload.payment.totalPrice;
      const advance = payload.payment.advancePaid;
      const balance = total - advance;

      const { orderStatus, paymentStatus } = derivePaymentState(
        total,
        advance,
        payload.payment.forceConfirm,
      );

      const deliveryCharge = payload.delivery.type === 'pickup' ? 0 : payload.delivery.charge ?? null;

      // Fully anonymous walk-in sale (no name, no phone) skips customer
      // creation entirely, rather than minting a blank-name/blank-phone
      // Customer row that would have no matching key and could never be
      // found or merged again. createOrderJsonSchema's if/then still
      // requires a name whenever a phone is provided, so this only ever
      // fires when both are genuinely absent.
      const isAnonymous = !payload.customer.name?.trim() && !payload.customer.phone;
      const customer = isAnonymous
        ? null
        : await customersService.upsertCustomer(tx, bakerId, {
            name: payload.customer.name!,
            phone: payload.customer.phone ?? null,
            address: payload.customer.address,
          });

      const newOrder = await tx.order.create({
        data: {
          bakerId,
          customerId: customer?.id ?? null,
          cakeCategory: payload.cake.category,
          cakeFlavour: payload.cake.flavour,
          weightInPounds: payload.cake.weightInPounds,
          quantity: payload.cake.quantity,
          occasion: payload.occasion,
          customInstructions: payload.customInstructions,
          deliveryType: payload.delivery.type,
          deliveryDate: new Date(`${payload.delivery.date}T00:00:00.000Z`),
          deliveryTime: payload.delivery.time
            ? new Date(`1970-01-01T${payload.delivery.time}:00.000Z`)
            : null,
          deliveryCharge,
          totalPrice: total,
          advancePaid: advance,
          balanceDue: balance,
          orderStatus,
          paymentStatus,
          referencePhotoUrl: payload.referencePhotoUrl,
          internalNotes: payload.internalNotes,
          customFields: payload.customFields,
        },
        include: { customer: true },
      });

      if (advance > 0) {
        await financeService.recordTransaction(tx, {
          bakerId,
          orderId: newOrder.id,
          amount: advance,
          eventType: 'advance_received',
          paymentMode: payload.payment.paymentMethod,
        });
      }

      await auditService.logEvent('ORDER_CREATED', newOrder.id, {
        bakerId,
        orderId: newOrder.id,
        orderNumber: newOrder.displayId,
        status: newOrder.orderStatus,
      });
      await cacheService.invalidateDashboardSummary(bakerId);

      return {
        orderId: newOrder.id,
        orderNumber: newOrder.displayId,
        customerName: newOrder.customer?.name ?? null,
        deliveryDate: newOrder.deliveryDate.toISOString().slice(0, 10),
        totalPrice: Number(newOrder.totalPrice),
        advancePaid: Number(newOrder.advancePaid),
        balanceDue: Number(newOrder.balanceDue),
        paymentStatus: newOrder.paymentStatus,
        status: newOrder.orderStatus,
        createdAt: newOrder.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves a paginated list of orders for a baker.
   */
  async getOrders(bakerId: string, query: import('./orders.schemas.js').GetOrdersQuery) {
    const { page, limit, status, search, deliveryDate, from, to, sort, order } = query;
    const pageVal = Number(page || 1);
    const limitVal = Number(limit || 20);
    const skip = (pageVal - 1) * limitVal;

    const where: import('@prisma/client').Prisma.OrderWhereInput = {
      bakerId,
    };

    // Default: exclude Cancelled unless explicitly requested
    if (status) {
      where.orderStatus = status;
    } else {
      where.orderStatus = { not: 'Cancelled' };
    }

    if (search) {
      where.OR = [
        { displayId: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    if (deliveryDate) {
      where.deliveryDate = new Date(`${deliveryDate}T00:00:00.000Z`);
    } else if (from || to) {
      where.deliveryDate = {};
      if (from) where.deliveryDate.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.deliveryDate.lte = new Date(`${to}T00:00:00.000Z`);
    }

    const sortFieldMap = { deliveryDate: 'deliveryDate', createdAt: 'createdAt', totalPrice: 'totalPrice' } as const;
    const orderBy: import('@prisma/client').Prisma.OrderOrderByWithRelationInput[] = [
      { [sortFieldMap[sort]]: order },
    ];
    if (sort !== 'createdAt') {
      orderBy.push({ createdAt: 'desc' });
    }

    const [totalItems, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limitVal,
        orderBy,
        select: {
          id: true,
          displayId: true,
          deliveryDate: true,
          orderStatus: true,
          totalPrice: true,
          balanceDue: true,
          customer: { select: { name: true, phone: true } },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limitVal);

    return {
      orders: orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.displayId,
        customerName: o.customer?.name ?? null,
        phone: o.customer?.phone ?? null,
        deliveryDate: o.deliveryDate.toISOString().slice(0, 10),
        status: o.orderStatus,
        totalPrice: Number(o.totalPrice),
        balanceDue: Number(o.balanceDue),
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
   * Fetches the complete details for a specific order (looked up by displayId).
   */
  async getOrderDetails(bakerId: string, orderNumber: string) {
    const order = await prisma.order.findFirst({
      where: { displayId: orderNumber, bakerId },
      include: { customer: true },
    });

    if (!order) {
      return null;
    }

    return {
      // NOTE: `orderId` here is the *display* id (e.g. "ORD-000001"), not a
      // UUID — kept as-is for backward compatibility with existing callers.
      // `id` below is the actual internal UUID, needed by endpoints like
      // POST /api/notifications/whatsapp that key off it instead of the
      // display id. The list endpoint (GET /api/orders) confusingly calls
      // the UUID `orderId` — the two endpoints do not share field meaning
      // for that name.
      id: order.id,
      orderId: order.displayId,
      status: order.orderStatus,
      // null when this is a fully anonymous walk-in sale with no linked
      // customer record at all - distinct from a linked customer that
      // simply has blank optional fields.
      customer: order.customer
        ? {
            name: order.customer.name,
            phone: order.customer.phone,
            address: order.customer.address,
          }
        : null,
      cake: {
        category: order.cakeCategory,
        flavour: order.cakeFlavour,
        weightInPounds: order.weightInPounds ? Number(order.weightInPounds) : null,
        quantity: order.quantity ? Number(order.quantity) : null,
      },
      occasion: order.occasion,
      customInstructions: order.customInstructions,
      delivery: {
        type: order.deliveryType,
        date: order.deliveryDate.toISOString().slice(0, 10),
        time: order.deliveryTime ? order.deliveryTime.toISOString().slice(11, 16) : null,
        charge: order.deliveryCharge ? Number(order.deliveryCharge) : null,
      },
      payment: {
        totalPrice: Number(order.totalPrice),
        advancePaid: Number(order.advancePaid),
        balanceDue: Number(order.balanceDue),
        paymentStatus: order.paymentStatus,
      },
      referencePhotoUrl: order.referencePhotoUrl,
      internalNotes: order.internalNotes,
      customFields: order.customFields,
    };
  }

  /**
   * Updates an order's status based on strict state machine rules.
   */
  async updateOrderStatus(bakerId: string, orderNumber: string, newStatus: OrderStatusValue) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { displayId: orderNumber, bakerId },
        select: { id: true, displayId: true, orderStatus: true },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      const previousStatus = order.orderStatus as OrderStatusValue;
      statusValidationService.assertValidTransition(previousStatus, newStatus);

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { orderStatus: newStatus },
        select: { id: true, displayId: true, orderStatus: true, updatedAt: true },
      });

      await cacheService.invalidateDashboardSummary(bakerId);

      await auditService.logEvent('ORDER_STATUS_UPDATED', updatedOrder.id, {
        bakerId,
        orderNumber: updatedOrder.displayId,
        previousStatus,
        currentStatus: updatedOrder.orderStatus,
        timestamp: updatedOrder.updatedAt.toISOString(),
      });

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.displayId,
        previousStatus,
        currentStatus: updatedOrder.orderStatus,
        updatedAt: updatedOrder.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Records a payment against the balance of an order.
   */
  async recordPayment(bakerId: string, orderNumber: string, payload: RecordPaymentBody) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { displayId: orderNumber, bakerId },
        select: {
          id: true,
          displayId: true,
          totalPrice: true,
          advancePaid: true,
          balanceDue: true,
          paymentStatus: true,
          orderStatus: true,
        },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      const totalPrice = Number(order.totalPrice);
      const previousAdvancePaid = Number(order.advancePaid);
      const balanceDue = Number(order.balanceDue);

      if (balanceDue === 0 || order.paymentStatus === 'Paid') {
        throw new ConflictError('No outstanding balance on this order.');
      }

      const amount = payload.amountReceived;

      if (amount <= 0) {
        throw new BadRequestError('Payment amount must be greater than 0.');
      }

      if (amount > balanceDue) {
        throw new BadRequestError('Payment exceeds outstanding balance.');
      }

      const newAdvancePaid = previousAdvancePaid + amount;
      const newBalanceDue = totalPrice - newAdvancePaid;

      const { orderStatus, paymentStatus } = derivePaymentState(
        totalPrice,
        newAdvancePaid,
        false,
        order.orderStatus as OrderStatusValue,
      );

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          advancePaid: newAdvancePaid,
          balanceDue: newBalanceDue,
          paymentStatus,
          orderStatus,
        },
        select: { id: true, displayId: true, balanceDue: true, paymentStatus: true, orderStatus: true },
      });

      // The first money received on an order is the advance; anything after is a balance payment.
      const eventType = previousAdvancePaid === 0 ? 'advance_received' : 'balance_received';

      const ledgerEntry = await financeService.recordTransaction(tx, {
        bakerId,
        orderId: updatedOrder.id,
        amount,
        eventType,
        paymentMode: payload.paymentMethod,
        transactionReference: payload.transactionReference,
      });

      await auditService.logEvent('PAYMENT_RECORDED', updatedOrder.id, {
        bakerId,
        orderNumber: updatedOrder.displayId,
        amount,
        paymentMode: payload.paymentMethod,
        paymentStatus: updatedOrder.paymentStatus,
        timestamp: ledgerEntry.occurredAt.toISOString(),
      });

      await cacheService.invalidateDashboardSummary(bakerId);

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.displayId,
        amountReceived: amount,
        balanceDue: Number(updatedOrder.balanceDue),
        paymentStatus: updatedOrder.paymentStatus,
        orderStatus: updatedOrder.orderStatus,
        paymentMethod: payload.paymentMethod,
        transactionDate: ledgerEntry.occurredAt.toISOString(),
      };
    });
  }

  /**
   * Updates an existing order (Action 9).
   */
  async updateOrder(bakerId: string, orderNumber: string, payload: UpdateOrderBody) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { displayId: orderNumber, bakerId },
        include: { customer: true },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      if (order.orderStatus === 'Delivered' || order.orderStatus === 'Cancelled') {
        throw new ConflictError(`Cannot edit an order in ${order.orderStatus} state.`);
      }

      let resolvedCustomerId: string;
      // Deferred until after the order itself is reassigned below - the
      // orphaned customer must not be deleted while this order still
      // points at it, since Order.customer is onDelete: Cascade and would
      // take the order down with it.
      let pendingOrphanMerge: { orphanedCustomerId: string; mergedIntoCustomerId: string } | null = null;

      if (!order.customer) {
        // Branch (a): this order was fully anonymous (no linked customer
        // at all). UpdateOrderBodySchema still requires a name on every
        // edit, so if we're here the baker just supplied identifying info
        // for the first time. Reuse the exact same find-or-create-by-phone
        // logic createOrder uses - if the phone matches an existing
        // customer, attach to that one instead of minting a duplicate.
        const customer = await customersService.upsertCustomer(tx, bakerId, {
          name: payload.customer.name,
          phone: payload.customer.phone ?? null,
          address: payload.customer.address,
        });
        resolvedCustomerId = customer.id;
      } else {
        // Filling in a previously-missing phone (order's own customer has
        // no phone on file yet) is treated differently from changing an
        // already-set phone: the former can legitimately turn out to
        // match an existing customer who IS this same real person under a
        // different blank-phone record, and should merge rather than
        // block. The latter (an already-set phone being reassigned to
        // someone else's number) stays blocked exactly as before - that's
        // much more likely a genuine mistake than a correction.
        const isFillingInPreviouslyMissingPhone = order.customer.phone === null && !!payload.customer.phone;

        let existingCustomer: { id: string } | null = null;
        if (payload.customer.phone && order.customer.phone !== payload.customer.phone) {
          existingCustomer = await tx.customer.findUnique({
            where: { bakerId_phone: { bakerId, phone: payload.customer.phone } },
            select: { id: true },
          });
        }

        if (existingCustomer && existingCustomer.id !== order.customerId) {
          if (!isFillingInPreviouslyMissingPhone) {
            throw new ConflictError('Customer with this phone number already exists.');
          }

          // Branch (b): auto-merge. Reassign this order onto the existing
          // customer rather than blocking. Deliberately does NOT overwrite
          // the existing customer's own name/phone/address - only this
          // order's linkage changes, so a locally-edited name on this one
          // order can't silently regress a more complete/correct name
          // already established on the canonical record. Cleanup of the
          // now-possibly-orphaned original customer is deferred until
          // after this order's own customerId has actually been
          // reassigned further down (see pendingOrphanMerge above).
          resolvedCustomerId = existingCustomer.id;
          pendingOrphanMerge = { orphanedCustomerId: order.customerId!, mergedIntoCustomerId: existingCustomer.id };
        } else {
          // No conflict - phone unchanged, a free number, or the first
          // phone ever recorded with no existing match. Update this
          // order's own linked customer in place, exactly as before.
          await tx.customer.update({
            where: { id: order.customerId! },
            data: {
              name: payload.customer.name,
              phone: payload.customer.phone ?? null,
              address: payload.customer.address,
            },
          });
          resolvedCustomerId = order.customerId!;

          await auditService.logEvent('CUSTOMER_UPDATED', resolvedCustomerId, {
            bakerId,
            customerId: resolvedCustomerId,
            phone: payload.customer.phone ?? null,
          });
        }
      }

      const total = payload.payment.totalPrice;
      const advance = payload.payment.advancePaid;
      const balance = total - advance;

      const { orderStatus, paymentStatus } = derivePaymentState(
        total,
        advance,
        false,
        order.orderStatus as OrderStatusValue,
      );

      const deliveryCharge = payload.delivery.type === 'pickup' ? 0 : payload.delivery.charge ?? null;

      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          customerId: resolvedCustomerId,
          cakeCategory: payload.cake.category,
          cakeFlavour: payload.cake.flavour,
          weightInPounds: payload.cake.weightInPounds,
          quantity: payload.cake.quantity,
          occasion: payload.occasion,
          customInstructions: payload.customInstructions,
          deliveryType: payload.delivery.type,
          deliveryDate: new Date(`${payload.delivery.date}T00:00:00.000Z`),
          deliveryTime: payload.delivery.time
            ? new Date(`1970-01-01T${payload.delivery.time}:00.000Z`)
            : null,
          deliveryCharge,
          totalPrice: total,
          advancePaid: advance,
          balanceDue: balance,
          orderStatus,
          paymentStatus,
          referencePhotoUrl: payload.referencePhotoUrl ?? null,
          internalNotes: payload.internalNotes,
          customFields: payload.customFields,
        },
        include: { customer: true },
      });

      // Now safe to check and clean up the orphaned customer - this order
      // has genuinely been reassigned away from it above, so a delete
      // here can no longer cascade into deleting the order we just saved.
      if (pendingOrphanMerge) {
        const { orphanedCustomerId, mergedIntoCustomerId } = pendingOrphanMerge;
        // Same lock -> re-verify -> delete -> audit-log pattern as the
        // earlier phantom repair. Lock first: another concurrent edit
        // could be reassigning a *different* order off this same
        // soon-to-be-orphaned customer at the same time.
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${orphanedCustomerId} FOR UPDATE`;
        const remainingOrders = await tx.order.count({ where: { customerId: orphanedCustomerId } });
        const orphanDeleted = remainingOrders === 0;
        if (orphanDeleted) {
          await tx.customer.delete({ where: { id: orphanedCustomerId } });
        }

        await auditService.logEvent('CUSTOMER_AUTO_MERGED_ON_EDIT', mergedIntoCustomerId, {
          bakerId,
          orderId: order.id,
          mergedFromCustomerId: orphanedCustomerId,
          mergedIntoCustomerId,
          orphanDeleted,
        });
      }

      await auditService.logEvent('ORDER_UPDATED', updatedOrder.id, {
        bakerId,
        orderNumber,
        fieldsChanged: Object.keys(payload),
        updatedAt: updatedOrder.updatedAt.toISOString(),
      });
      await cacheService.invalidateDashboardSummary(bakerId);

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.displayId,
        customerName: updatedOrder.customer?.name ?? null,
        deliveryDate: updatedOrder.deliveryDate.toISOString().slice(0, 10),
        totalPrice: Number(updatedOrder.totalPrice),
        advancePaid: Number(updatedOrder.advancePaid),
        balanceDue: Number(updatedOrder.balanceDue),
        paymentStatus: updatedOrder.paymentStatus,
        updatedAt: updatedOrder.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Cancels an order (order_status = Cancelled). No separate soft-delete —
   * Cancelled is a real, filterable order_status value.
   */
  async cancelOrder(bakerId: string, orderNumber: string) {
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { displayId: orderNumber, bakerId },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      if (order.orderStatus === 'Delivered') {
        throw new ConflictError('Delivered orders cannot be cancelled.', 'ORDER_ALREADY_DELIVERED');
      }

      if (order.orderStatus === 'Cancelled') {
        throw new ConflictError('Order is already cancelled.', 'ORDER_ALREADY_CANCELLED');
      }

      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { orderStatus: 'Cancelled', updatedAt: now },
      });

      await auditService.logEvent('ORDER_CANCELLED', updatedOrder.id, {
        bakerId,
        orderId: updatedOrder.id,
        orderNumber,
        previousStatus: order.orderStatus,
        cancelledAt: now.toISOString(),
        cancelledBy: bakerId,
      });
      await cacheService.invalidateDashboardSummary(bakerId);

      return {
        orderNumber: updatedOrder.displayId,
        status: updatedOrder.orderStatus,
        cancelledAt: now.toISOString(),
        message: 'Order cancelled successfully.',
      };
    });
  }
}

export const ordersService = new OrdersService();
