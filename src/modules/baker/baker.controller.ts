import type { FastifyRequest, FastifyReply } from 'fastify';
import { updateUpiSettings } from './payment-settings.service.js';
import { getBakerProfile } from './baker-profile.service.js';
import type { UpdateUpiSettingsBody } from './baker.schemas.js';

export async function updateUpiSettingsHandler(
  req: FastifyRequest<{ Body: UpdateUpiSettingsBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const updatedSettings = await updateUpiSettings(bakerId, req.body);

  return reply.code(200).send({
    success: true,
    data: {
      ...updatedSettings,
      updatedAt: updatedSettings.updatedAt.toISOString(),
    },
  });
}

export async function getBakerProfileHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const result = await getBakerProfile(bakerId);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
