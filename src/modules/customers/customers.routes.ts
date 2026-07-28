import type { FastifyInstance } from 'fastify';
import { getCustomers, getCustomerProfile, updateCustomer } from './customers.controller.js';
import { getCustomersJsonSchema, getCustomerProfileJsonSchema, updateCustomerJsonSchema } from './customers.schemas.js';

/**
 * Customer routes plugin.
 * Handles mini CRM and Customer Directory logic.
 * 
 * Routes:
 *   GET   /api/customers  — Get paginated and sorted customer directory
 */
export async function customersRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: getCustomersJsonSchema,
    preHandler: [app.authenticate],
    handler: getCustomers,
  });

  app.get('/:customerId', {
    schema: getCustomerProfileJsonSchema,
    preHandler: [app.authenticate],
    handler: getCustomerProfile,
  });

  app.put('/:customerId', {
    schema: updateCustomerJsonSchema,
    preHandler: [app.authenticate],
    handler: updateCustomer,
  });
}
