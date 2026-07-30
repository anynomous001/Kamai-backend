import type { FastifyInstance } from 'fastify';

import { generateWhatsAppLinkHandler } from './notifications.controller.js';
import { GenerateWhatsAppLinkSchema } from './notifications.schemas.js';

export async function notificationsRoutes(app: FastifyInstance) {
  app.post('/whatsapp', {
    schema: GenerateWhatsAppLinkSchema,
    preHandler: [app.authenticate],
    handler: generateWhatsAppLinkHandler,
  });
}
