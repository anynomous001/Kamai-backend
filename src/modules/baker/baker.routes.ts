import type { FastifyInstance } from 'fastify';
import { updateUpiSettingsHandler, getBakerProfileHandler, updateBakerProfileHandler } from './baker.controller.js';
import { UpdateUpiSettingsSchema, GetBakerProfileSchema, UpdateBakerProfileSchema } from './baker.schemas.js';

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

  app.patch('/profile', {
    schema: UpdateBakerProfileSchema,
    preHandler: [app.authenticate],
    handler: updateBakerProfileHandler,
  });
}
