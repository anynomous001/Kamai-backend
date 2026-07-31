import type { FastifyRequest, FastifyReply } from 'fastify';

import { getPublicMenu } from './public-menu.service.js';

export async function getPublicMenuHandler(
  req: FastifyRequest<{ Params: { bakerSlug: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const result = await getPublicMenu(req.params.bakerSlug);

  return reply.code(200).send({ success: true, data: result });
}
