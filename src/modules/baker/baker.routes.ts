import type { FastifyInstance } from 'fastify';

import {
  updateUpiSettingsHandler,
  getBakerProfileHandler,
  updateBakerProfileHandler,
  updateMenuSlugHandler,
} from './baker.controller.js';
import {
  UpdateUpiSettingsSchema,
  GetBakerProfileSchema,
  UpdateBakerProfileSchema,
  UpdateMenuSlugSchema,
} from './baker.schemas.js';

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

  app.patch('/menu-slug', {
    schema: UpdateMenuSlugSchema,
    preHandler: [app.authenticate],
    handler: updateMenuSlugHandler,
  });
}
