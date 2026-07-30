import type { FastifyInstance } from 'fastify';

import { generateUploadUrlHandler, confirmUploadHandler } from './uploads.controller.js';
import { GenerateUploadUrlSchema, ConfirmUploadSchema } from './uploads.schemas.js';

export async function uploadsRoutes(app: FastifyInstance) {
  app.post('/signed-url', {
    schema: GenerateUploadUrlSchema,
    preHandler: [app.authenticate],
    handler: generateUploadUrlHandler,
  });

  app.post('/confirm', {
    schema: ConfirmUploadSchema,
    preHandler: [app.authenticate],
    handler: confirmUploadHandler,
  });
}
