import type { FastifyInstance } from 'fastify';

import { createSupportChatHandler } from './support.controller.js';
import { CreateSupportChatSchema } from './support.schemas.js';

export async function supportRoutes(app: FastifyInstance) {
  // No requireWriteAccess (deliberate): a trial-expired or otherwise
  // read-only baker must still be able to reach support - billing
  // disputes, help resubscribing, or general help. Same reasoning as
  // billing's create-subscription/cancel-subscription staying ungated -
  // a locked-out baker still needs a way to get unstuck.
  app.post('/chat', {
    schema: CreateSupportChatSchema,
    preHandler: [app.authenticate],
    handler: createSupportChatHandler,
  });
}
