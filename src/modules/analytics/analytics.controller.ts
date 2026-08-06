import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError } from '../../shared/errors/index.js';

import { getAnalyticsSummary } from './analytics.service.js';
import type { GetAnalyticsSummaryQuery } from './analytics.schemas.js';

export async function getSummary(
  req: FastifyRequest<{ Querystring: GetAnalyticsSummaryQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (bakerId == null) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const months = Number(req.query.months);
  const result = await getAnalyticsSummary(bakerId, months);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
