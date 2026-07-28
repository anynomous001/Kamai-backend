import type { FastifyRequest, FastifyReply } from 'fastify';
import { generateUploadUrl, confirmUpload } from './uploads.service.js';
import type { GenerateUploadUrlBody, ConfirmUploadBody } from './uploads.schemas.js';

export async function generateUploadUrlHandler(
  req: FastifyRequest<{ Body: GenerateUploadUrlBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const { contentType, category } = req.body;
  const result = await generateUploadUrl(bakerId, contentType, category);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function confirmUploadHandler(
  req: FastifyRequest<{ Body: ConfirmUploadBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;
  if (!bakerId) {
    return reply.code(401).send({ success: false, errorCode: 'UNAUTHORIZED' });
  }

  const { filePath, category } = req.body;
  const result = await confirmUpload(bakerId, filePath, category);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
