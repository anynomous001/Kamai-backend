import type { FastifyInstance } from 'fastify';

import {
  createInvestmentHandler,
  getInvestmentsHandler,
  deleteInvestmentHandler,
} from './investments.controller.js';
import {
  createInvestmentJsonSchema,
  getInvestmentsJsonSchema,
  deleteInvestmentJsonSchema,
} from './investments.schemas.js';

/**
 * Investments Routes
 * Prefix: /api/investments
 */
export async function investmentsRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: createInvestmentJsonSchema,
    preHandler: [app.authenticate],
    handler: createInvestmentHandler,
  });

  app.get('/', {
    schema: getInvestmentsJsonSchema,
    preHandler: [app.authenticate],
    handler: getInvestmentsHandler,
  });

  app.delete('/:entryId', {
    schema: deleteInvestmentJsonSchema,
    preHandler: [app.authenticate],
    handler: deleteInvestmentHandler,
  });
}
