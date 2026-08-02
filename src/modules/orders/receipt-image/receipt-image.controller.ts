import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError } from '../../../shared/errors/index.js';
import type { GetOrderParams } from '../orders.schemas.js';

import { generateReceiptImage } from './receipt-image.service.js';

export async function generateReceiptImageHandler(
  req: FastifyRequest<{ Params: GetOrderParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { orderNumber } = req.params;
  const result = await generateReceiptImage(bakerId, orderNumber);

  return reply.code(200).send({ success: true, data: result });
}
