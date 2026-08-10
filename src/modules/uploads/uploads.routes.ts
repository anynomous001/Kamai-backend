import type { FastifyInstance } from 'fastify';

import { generateUploadUrlHandler, confirmUploadHandler } from './uploads.controller.js';
import { GenerateUploadUrlSchema, ConfirmUploadSchema } from './uploads.schemas.js';

export async function uploadsRoutes(app: FastifyInstance) {
  // Every category (BUSINESS_LOGO, FSSAI_DOCUMENT, MENU_ITEM_PHOTO) is tied
  // to a blocked write (profile edit or menu item edit) - blocking the
  // upload endpoints unconditionally rather than branching on category.
  app.post('/signed-url', {
    schema: GenerateUploadUrlSchema,
    preHandler: [app.authenticate, app.requireWriteAccess],
    handler: generateUploadUrlHandler,
  });

  app.post('/confirm', {
    schema: ConfirmUploadSchema,
    preHandler: [app.authenticate, app.requireWriteAccess],
    handler: confirmUploadHandler,
  });
}
