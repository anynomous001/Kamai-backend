import { prisma } from '../../shared/database/prisma.js';
import { customersService } from '../customers/customers.service.js';
import { orderNumberService } from './order-number.service.js';
import { cacheService } from '../../shared/cache/index.js';
import { auditService } from '../../shared/audit/index.js';
import { financeService } from '../finance/finance.service.js';
import { statusValidationService } from './status-validation.service.js';
import type { CreateOrderPayload, RecordPaymentBody, UpdateOrderBody } from './orders.schemas.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../shared/errors/index.js';

export class OrdersService {
  /**
   * Creates a new order and upserts the customer within a single transaction.
   */
  async createOrder(bakerId: string, payload: CreateOrderPayload) {
    return prisma.$transaction(async (tx) => {
      // 1. Calculate balance due server-side
      const total = payload.payment.totalPrice;
      const advance = payload.payment.advancePaid;
      const balance = total - advance;

      let initialPaymentStatus: import('@prisma/client').PaymentStatus = 'UNPAID';
      if (advance > 0 && balance > 0) {
        initialPaymentStatus = 'PARTIALLY_PAID';
      } else if (balance === 0) {
        initialPaymentStatus = 'PAID';
      }

      // 2. Combine date and time into a single UTC DateTime
      const deliveryDate = new Date(`${payload.delivery.date}T${payload.delivery.time}:00`);

      // 3. Generate unique order number
      const orderNumber = await orderNumberService.generateOrderNumber();

      // 4. Upsert Customer
      const customer = await customersService.upsertCustomer(tx, bakerId, {
        name: payload.customer.name,
        phone: payload.customer.phone,
        address: payload.customer.address,
      });

      // 5. Create Order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          bakerId,
          customerId: customer.id,
          category: payload.cake.category,
          weight: payload.cake.weight,
          flavour: payload.cake.flavour,
          referencePhoto: payload.referencePhoto,
          deliveryDate,
          totalPrice: total,
          advancePaid: advance,
          balanceDue: balance,
          paymentStatus: initialPaymentStatus,
          status: 'PENDING',
        },
        include: { customer: true },
      });

      // 6. Initialize Payment Ledger (if advance paid)
      if (advance > 0) {
        await financeService.recordTransaction(tx, {
          bakerId,
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          amount: advance,
          type: 'CREDIT',
          paymentMode: 'CASH',
          transactionReference: 'ADVANCE',
        });
      }

      // 7. Audit Log
      await auditService.logEvent('ORDER_CREATED', newOrder.id, {
        bakerId,
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
      });

      // 8. Recalculate CRM Metrics
      await customersService.recalculateMetrics(tx, customer.id);

      // 9. Invalidate Dashboard Cache
      await cacheService.invalidateDashboardSummary(bakerId);

      return {
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        customerName: newOrder.customer.name,
        deliveryDate: newOrder.deliveryDate.toISOString(),
        totalPrice: newOrder.totalPrice,
        advancePaid: newOrder.advancePaid,
        balanceDue: newOrder.balanceDue,
        paymentStatus: newOrder.paymentStatus,
        status: newOrder.status,
        createdAt: newOrder.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves a paginated list of orders for a baker.
   * Applies filtering based on status, search string, and dates.
   */
  async getOrders(bakerId: string, query: import('./orders.schemas.js').GetOrdersQuery) {
    const { page, limit, status, search, deliveryDate, from, to, sort, order } = query;
    const pageVal = Number(page || 1);
    const limitVal = Number(limit || 20);
    const skip = (pageVal - 1) * limitVal;

    // 1. Build dynamic 'where' clause
    const where: import('@prisma/client').Prisma.OrderWhereInput = {
      bakerId,
      deletedAt: null,
    };

    // Filter by status (default: exclude CANCELLED unless explicitly requested)
    if (status) {
      where.status = status;
    } else {
      where.status = { not: 'CANCELLED' };
    }

    // Filter by search (customer name, phone, orderNumber)
    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { phone: { contains: search } } },
      ];
    }

    // Filter by date
    if (deliveryDate) {
      // Exact day match
      where.deliveryDate = {
        gte: new Date(`${deliveryDate}T00:00:00.000Z`),
        lte: new Date(`${deliveryDate}T23:59:59.999Z`),
      };
    } else if (from || to) {
      // Date range match
      where.deliveryDate = {};
      if (from) where.deliveryDate.gte = new Date(`${from}T00:00:00.000Z`);
      if (to) where.deliveryDate.lte = new Date(`${to}T23:59:59.999Z`);
    }

    // 2. Build multi-sort
    // Note: Prisma accepts an array for multiple order-by clauses
    const orderBy: import('@prisma/client').Prisma.OrderOrderByWithRelationInput[] = [];
    orderBy.push({ [sort]: order });

    // Tie-breaker: If they aren't already sorting by createdAt, use it as secondary
    if (sort !== 'createdAt') {
      orderBy.push({ createdAt: 'desc' });
    }

    // 3. Execute queries within a transaction
    const [totalItems, orders] = await prisma.$transaction([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        skip,
        take: limitVal,
        orderBy,
        select: {
          id: true,
          orderNumber: true,
          deliveryDate: true,
          status: true,
          totalPrice: true,
          balanceDue: true,
          customer: {
            select: {
              name: true,
              phone: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalItems / limitVal);

    return {
      orders: orders.map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customer.name,
        phone: o.customer.phone,
        deliveryDate: o.deliveryDate,
        status: o.status,
        totalPrice: o.totalPrice,
        balanceDue: o.balanceDue,
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
   * Fetches the complete details for a specific order.
   * Ensures the order belongs to the authenticated baker.
   */
  async getOrderDetails(bakerId: string, orderNumber: string) {
    const order = await prisma.order.findUnique({
      where: {
        orderNumber,
        bakerId,
      },
      include: {
        customer: true,
      },
    });

    if (!order || order.deletedAt !== null) {
      return null;
    }

    return {
      orderId: order.orderNumber, // Returning orderNumber as requested in DTO example
      status: order.status,
      customer: {
        name: order.customer.name,
        phone: order.customer.phone,
        address: order.customer.address,
      },
      cake: {
        category: order.category,
        weight: order.weight,
        flavour: order.flavour,
      },
      delivery: {
        date: order.deliveryDate.toISOString().slice(0, 10), // YYYY-MM-DD
        time: order.deliveryDate.toISOString().slice(11, 16), // HH:mm
      },
      payment: {
        totalPrice: order.totalPrice,
        advancePaid: order.advancePaid,
        balanceDue: order.balanceDue,
      },
      referencePhoto: order.referencePhoto,
    };
  }

  /**
   * Updates an order's status based on strict state machine rules.
   */
  async updateOrderStatus(
    bakerId: string,
    orderNumber: string,
    newStatus: import('@prisma/client').OrderStatus,
  ) {
    // 1. Fetch current order in a transaction to handle concurrency properly
    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: {
          orderNumber,
          bakerId,
          deletedAt: null, // exclude soft-deleted
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
        },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      const previousStatus = order.status;

      // 2. Validate state machine transition
      statusValidationService.assertValidTransition(previousStatus, newStatus);

      // 3. Update the order
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { status: newStatus },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          updatedAt: true,
        },
      });

      // 4. Invalidate dashboard cache
      await cacheService.invalidateDashboardSummary(bakerId);

      // 5. Audit Trail
      await auditService.logEvent('ORDER_STATUS_UPDATED', updatedOrder.id, {
        bakerId,
        orderNumber: updatedOrder.orderNumber,
        previousStatus,
        currentStatus: updatedOrder.status,
        timestamp: updatedOrder.updatedAt.toISOString(),
      });

      // TODO: If updatedOrder.status === 'READY', enable WhatsApp Notification hook
      // TODO: If updatedOrder.status === 'DELIVERED', enable Payment Reconciliation hook

      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        previousStatus,
        currentStatus: updatedOrder.status,
        updatedAt: updatedOrder.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Records a payment against the balance of an order.
   * Executes securely within a transaction to prevent race conditions.
   */
  async recordPayment(bakerId: string, orderNumber: string, payload: RecordPaymentBody) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch current order state
      const order = await tx.order.findUnique({
        where: {
          orderNumber,
          bakerId,
          deletedAt: null,
        },
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          advancePaid: true,
          balanceDue: true,
          paymentStatus: true,
        },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // 2. Business Validations
      if (order.balanceDue === 0 || order.paymentStatus === 'PAID') {
        throw new ConflictError('No outstanding balance on this order.');
      }

      const amount = payload.amountReceived;

      if (amount <= 0) {
        throw new BadRequestError('Payment amount must be greater than 0.');
      }

      if (amount > order.balanceDue) {
        throw new BadRequestError('Payment exceeds outstanding balance.');
      }

      // 3. Calculate new values
      const newAdvancePaid = order.advancePaid + amount;
      const newBalanceDue = order.balanceDue - amount;
      const newPaymentStatus = newBalanceDue === 0 ? 'PAID' : 'PARTIALLY_PAID';

      // 4. Update the order
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          advancePaid: newAdvancePaid,
          balanceDue: newBalanceDue,
          paymentStatus: newPaymentStatus,
        },
        select: {
          id: true,
          orderNumber: true,
          balanceDue: true,
          paymentStatus: true,
        },
      });

      // 5. Insert Payment Ledger Entry
      const ledgerEntry = await financeService.recordTransaction(tx, {
        bakerId,
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        amount: amount,
        type: 'CREDIT',
        paymentMode: payload.paymentMethod,
        transactionReference: payload.transactionReference,
      });

      // 6. Insert Audit Log
      await auditService.logEvent('PAYMENT_RECORDED', updatedOrder.id, {
        bakerId,
        orderNumber: updatedOrder.orderNumber,
        amount: amount,
        paymentMode: payload.paymentMethod,
        paymentStatus: updatedOrder.paymentStatus,
        timestamp: ledgerEntry.transactionDate.toISOString(),
      });

      // 7. Invalidate dashboard cache
      await cacheService.invalidateDashboardSummary(bakerId);

      // Return unified response
      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        amountReceived: amount,
        balanceDue: updatedOrder.balanceDue,
        paymentStatus: updatedOrder.paymentStatus,
        paymentMethod: payload.paymentMethod,
        transactionDate: ledgerEntry.transactionDate.toISOString(),
      };
    });
  }

  /**
   * Updates an existing order (Action 9).
   */
  async updateOrder(bakerId: string, orderNumber: string, payload: UpdateOrderBody) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch current order with customer
      const order = await tx.order.findUnique({
        where: { orderNumber, bakerId, deletedAt: null },
        include: { customer: true },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // 2. Validate Order Status
      if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
        throw new ConflictError(`Cannot edit an order in ${order.status} state.`);
      }

      // 3. Handle Customer Update
      // Use customersService to securely upsert and log customer modifications
      if (order.customer.phone !== payload.customer.phone) {
        // Just verify there's no conflict with another customer before letting upsertCustomer do its thing
        const existingCustomer = await tx.customer.findUnique({
          where: {
            bakerId_phone: { bakerId, phone: payload.customer.phone },
          },
        });

        if (existingCustomer) {
          throw new ConflictError('Customer with this phone number already exists.');
        }
      }

      const updatedCustomer = await customersService.upsertCustomer(tx, bakerId, payload.customer);

      // 4. Calculate Delivery Date
      const deliveryDate = new Date(`${payload.delivery.date}T${payload.delivery.time}:00.000Z`);

      // 5. Calculate Financials
      const total = payload.payment.totalPrice;
      const advance = payload.payment.advancePaid;
      const balance = total - advance;

      let paymentStatus: import('@prisma/client').PaymentStatus = 'UNPAID';
      if (advance > 0 && balance > 0) {
        paymentStatus = 'PARTIALLY_PAID';
      } else if (balance === 0) {
        paymentStatus = 'PAID';
      }

      // 6. Update Order
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          category: payload.cake.category,
          weight: payload.cake.weight,
          flavour: payload.cake.flavour,
          deliveryDate,
          totalPrice: total,
          advancePaid: advance,
          balanceDue: balance,
          paymentStatus,
          referencePhoto: payload.referencePhoto ?? null,
        },
        include: { customer: true },
      });

      // 7. Audit Log
      // Assuming a simplistic diff by capturing the new payload values
      await auditService.logEvent('ORDER_UPDATED', updatedOrder.id, {
        bakerId,
        orderNumber,
        fieldsChanged: Object.keys(payload),
        updatedAt: updatedOrder.updatedAt.toISOString(),
      });

      // 8. Recalculate CRM Metrics
      await customersService.recalculateMetrics(tx, updatedCustomer.id);

      // 9. Invalidate Dashboard Cache
      await cacheService.invalidateDashboardSummary(bakerId);

      // Return unified response
      return {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        customerName: updatedOrder.customer.name,
        deliveryDate: updatedOrder.deliveryDate.toISOString(),
        totalPrice: updatedOrder.totalPrice,
        advancePaid: updatedOrder.advancePaid,
        balanceDue: updatedOrder.balanceDue,
        paymentStatus: updatedOrder.paymentStatus,
        updatedAt: updatedOrder.updatedAt.toISOString(),
      };
    });
  }

  /**
   * Cancels and archives an order (Action 10).
   */
  async cancelOrder(bakerId: string, orderNumber: string) {
    return prisma.$transaction(async (tx) => {
      // 1. Fetch current order
      const order = await tx.order.findUnique({
        where: { orderNumber, bakerId, deletedAt: null },
      });

      if (!order) {
        throw new NotFoundError('Order not found');
      }

      // 2. Validate Order Status
      if (order.status === 'DELIVERED') {
        throw new ConflictError(
          'Delivered orders cannot be cancelled.',
          'ORDER_ALREADY_DELIVERED',
        );
      }

      if (order.status === 'CANCELLED') {
        throw new ConflictError(
          'Order is already cancelled.',
          'ORDER_ALREADY_CANCELLED',
        );
      }

      // 3. Update Order (Soft Delete + Cancel)
      const now = new Date();
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'CANCELLED',
          deletedAt: now,
          updatedAt: now,
        },
      });

      // 4. Audit Log
      await auditService.logEvent('ORDER_CANCELLED', updatedOrder.id, {
        bakerId,
        orderId: updatedOrder.id,
        orderNumber,
        previousStatus: order.status,
        cancelledAt: now.toISOString(),
        cancelledBy: bakerId,
      });

      // 5. Recalculate CRM Metrics
      await customersService.recalculateMetrics(tx, order.customerId);

      // 6. Invalidate Dashboard Cache
      await cacheService.invalidateDashboardSummary(bakerId);

      // Return success envelope payload
      return {
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.status,
        cancelledAt: now.toISOString(),
        message: 'Order cancelled successfully.',
      };
    });
  }
}

export const ordersService = new OrdersService();
