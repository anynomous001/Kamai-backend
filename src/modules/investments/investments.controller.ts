import type { FastifyRequest, FastifyReply } from 'fastify';
import { InternalServerError } from '../../shared/errors/index.js';
import { createInvestment, getInvestments, deleteInvestment } from './investments.service.js';
import type { CreateInvestmentBody, GetInvestmentsQuery } from './investments.schemas.js';

export async function createInvestmentHandler(
  req: FastifyRequest<{ Body: CreateInvestmentBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const result = await createInvestment(bakerId, req.body);

  return reply.code(201).send({
    success: true,
    data: result,
  });
}

export async function getInvestmentsHandler(
  req: FastifyRequest<{ Querystring: GetInvestmentsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const result = await getInvestments(bakerId, req.query);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function deleteInvestmentHandler(
  req: FastifyRequest<{ Params: { entryId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { entryId } = req.params;
  await deleteInvestment(bakerId, entryId);

  return reply.code(200).send({
    success: true,
  });
}
