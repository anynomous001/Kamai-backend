import type { FastifyRequest, FastifyReply } from 'fastify';
import { InternalServerError } from '../../shared/errors/index.js';
import { getBillingStatus, createSubscription } from './billing.service.js';
import type { CreateSubscriptionBody } from './billing.schemas.js';

export async function getBillingStatusHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const result = await getBillingStatus(bakerId);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function createSubscriptionHandler(
  req: FastifyRequest<{ Body: CreateSubscriptionBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const result = await createSubscription(bakerId, req.body);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
