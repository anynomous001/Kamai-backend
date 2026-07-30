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

      const customer = await customersService.upsertCustomer(tx, bakerId, {
        name: payload.customer.name,
        phone: payload.customer.phone ?? null,
        address: payload.customer.address,
      });

      const newOrder = await tx.order.create({
        data: {
          bakerId,
          customerId: customer.id,
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
        customerName: newOrder.customer.name,
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
        customerName: o.customer.name,
        phone: o.customer.phone,
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
      orderId: order.displayId,
      status: order.orderStatus,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        address: order.customer.address,
      },
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

      if (payload.customer.phone && order.customer.phone !== payload.customer.phone) {
        const existingCustomer = await tx.customer.findUnique({
          where: { bakerId_phone: { bakerId, phone: payload.customer.phone } },
        });

        if (existingCustomer) {
          throw new ConflictError('Customer with this phone number already exists.');
        }
      }

      await customersService.upsertCustomer(tx, bakerId, {
        name: payload.customer.name,
        phone: payload.customer.phone ?? null,
        address: payload.customer.address,
      });

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
        customerName: updatedOrder.customer.name,
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
