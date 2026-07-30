import type { FastifyRequest, FastifyReply } from 'fastify';

import { updateUpiSettings } from './payment-settings.service.js';
import { getBakerProfile, updateBakerProfile } from './baker-profile.service.js';
import type { UpdateUpiSettingsBody, UpdateBakerProfileBody } from './baker.schemas.js';

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

export async function updateBakerProfileHandler(
  req: FastifyRequest<{ Body: UpdateBakerProfileBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const updated = await updateBakerProfile(bakerId, req.body);

  return reply.code(200).send({
    success: true,
    data: {
      ...updated,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
