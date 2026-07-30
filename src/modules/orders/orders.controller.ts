import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError, NotFoundError } from '../../shared/errors/index.js';

import { ordersService } from './orders.service.js';
import type { CreateOrderPayload } from './orders.schemas.js';

export async function createOrder(
  req: FastifyRequest<{ Body: CreateOrderPayload }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const payload = req.body;
  const order = await ordersService.createOrder(bakerId, payload);

  return reply.code(200).send({
    success: true,
    data: {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      balanceDue: order.balanceDue,
      status: order.status,
    },
  });
}

export async function getOrders(
  req: FastifyRequest<{ Querystring: import('./orders.schemas.js').GetOrdersQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const query = req.query;
  const result = await ordersService.getOrders(bakerId, query);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function getOrderDetails(
  req: FastifyRequest<{ Params: import('./orders.schemas.js').GetOrderParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { orderNumber } = req.params;
  const order = await ordersService.getOrderDetails(bakerId, orderNumber);

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  return reply.code(200).send({
    success: true,
    data: order,
  });
}

export async function updateOrderStatus(
  req: FastifyRequest<{
    Params: import('./orders.schemas.js').UpdateOrderStatusParams;
    Body: import('./orders.schemas.js').UpdateOrderStatusBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { orderNumber } = req.params;
  const { status } = req.body;

  const result = await ordersService.updateOrderStatus(bakerId, orderNumber, status);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function recordPayment(
  req: FastifyRequest<{
    Params: import('./orders.schemas.js').RecordPaymentParams;
    Body: import('./orders.schemas.js').RecordPaymentBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { orderNumber } = req.params;
  const payload = req.body;

  const result = await ordersService.recordPayment(bakerId, orderNumber, payload);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function updateOrder(
  req: FastifyRequest<{
    Params: import('./orders.schemas.js').UpdateOrderParams;
    Body: import('./orders.schemas.js').UpdateOrderBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { orderNumber } = req.params;
  const payload = req.body;

  const result = await ordersService.updateOrder(bakerId, orderNumber, payload);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function cancelOrder(
  req: FastifyRequest<{
    Params: import('./orders.schemas.js').CancelOrderParams;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { orderNumber } = req.params;

  const result = await ordersService.cancelOrder(bakerId, orderNumber);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
