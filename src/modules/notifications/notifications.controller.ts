import type { FastifyRequest, FastifyReply } from 'fastify';
import { generateWhatsAppMessage } from './notifications.service.js';
import type { GenerateWhatsAppLinkBody } from './notifications.schemas.js';

export async function generateWhatsAppLinkHandler(
  req: FastifyRequest<{ Body: GenerateWhatsAppLinkBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const { orderId, template } = req.body;
  const result = await generateWhatsAppMessage(bakerId, orderId, template);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
