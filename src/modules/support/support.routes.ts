import type { FastifyInstance } from 'fastify';

import { createSupportChatHandler } from './support.controller.js';
import { CreateSupportChatSchema } from './support.schemas.js';

export async function supportRoutes(app: FastifyInstance) {
  app.post('/chat', {
    schema: CreateSupportChatSchema,
    preHandler: [app.authenticate],
    handler: createSupportChatHandler,
  });
}
