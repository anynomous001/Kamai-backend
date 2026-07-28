import type { FastifyInstance } from 'fastify';
import { updateUpiSettingsHandler, getBakerProfileHandler } from './baker.controller.js';
import { UpdateUpiSettingsSchema, GetBakerProfileSchema } from './baker.schemas.js';

export async function bakerRoutes(app: FastifyInstance) {
  app.put('/upi-settings', {
    schema: UpdateUpiSettingsSchema,
    preHandler: [app.authenticate],
    handler: updateUpiSettingsHandler,
  });

  app.get('/profile', {
    schema: GetBakerProfileSchema,
    preHandler: [app.authenticate],
    handler: getBakerProfileHandler,
  });
}
