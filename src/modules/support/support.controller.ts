import type { FastifyRequest, FastifyReply } from 'fastify';

import { createSupportChatLink } from './support.service.js';
import type { CreateSupportChatBody } from './support.schemas.js';

export async function createSupportChatHandler(
  req: FastifyRequest<{ Body: CreateSupportChatBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const { issueType, message } = req.body;
  const result = await createSupportChatLink(bakerId, issueType, message);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
