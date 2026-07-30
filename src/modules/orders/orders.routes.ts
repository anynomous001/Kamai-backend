import type { FastifyInstance } from 'fastify';

import {
  createOrder,
  getOrders,
  getOrderDetails,
  updateOrderStatus,
  recordPayment,
  updateOrder,
  cancelOrder,
} from './orders.controller.js';
import {
  createOrderJsonSchema,
  getOrdersJsonSchema,
  getOrderJsonSchema,
  updateOrderStatusJsonSchema,
  recordPaymentJsonSchema,
  updateOrderJsonSchema,
  cancelOrderJsonSchema,
} from './orders.schemas.js';

/**
 * Orders Routes
 *
 * Registered in app.ts with prefix: /api/orders
 *
 * Routes:
 *   POST  /api/orders                   — Create a new order
 *   GET   /api/orders                   — Get paginated order history
 *   GET   /api/orders/:orderNumber      — Get order details
 *   PUT   /api/orders/:orderNumber      — Update order
 *   DELETE /api/orders/:orderNumber     — Cancel/Archive order
 *   PATCH /api/orders/:orderNumber/status — Update order status
 *   PATCH /api/orders/:orderNumber/payment — Record balance payment
 */
export async function ordersRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: createOrderJsonSchema,
    preHandler: [app.authenticate],
    handler: createOrder,
  });

  app.get('/', {
    schema: getOrdersJsonSchema,
    preHandler: [app.authenticate],
    handler: getOrders,
  });

  app.get('/:orderNumber', {
    schema: getOrderJsonSchema,
    preHandler: [app.authenticate],
    handler: getOrderDetails,
  });

  app.patch('/:orderNumber/status', {
    schema: updateOrderStatusJsonSchema,
    preHandler: [app.authenticate],
    handler: updateOrderStatus,
  });

  app.patch('/:orderNumber/payment', {
    schema: recordPaymentJsonSchema,
    preHandler: [app.authenticate],
    handler: recordPayment,
  });

  app.put('/:orderNumber', {
    schema: updateOrderJsonSchema,
    preHandler: [app.authenticate],
    handler: updateOrder,
  });

  app.delete('/:orderNumber', {
    schema: cancelOrderJsonSchema,
    preHandler: [app.authenticate],
    handler: cancelOrder,
  });
}
