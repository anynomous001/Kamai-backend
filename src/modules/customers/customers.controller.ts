import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError } from '../../shared/errors/index.js';

import { customersService } from './customers.service.js';

export async function getCustomers(
  req: FastifyRequest<{ Querystring: import('./customers.schemas.js').GetCustomersQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const query = req.query;
  const result = await customersService.getCustomers(bakerId, query);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function getCustomerProfile(
  req: FastifyRequest<{
    Params: import('./customers.schemas.js').GetCustomerProfileParams;
    Querystring: import('./customers.schemas.js').GetCustomerProfileQuery;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { customerId } = req.params;
  const query = req.query;

  const result = await customersService.getCustomerProfile(bakerId, customerId, query);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}

export async function updateCustomer(
  req: FastifyRequest<{
    Params: import('./customers.schemas.js').UpdateCustomerParams;
    Body: import('./customers.schemas.js').UpdateCustomerBody;
  }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = req.user?.id;

  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }

  const { customerId } = req.params;
  const payload = req.body;

  const result = await customersService.updateCustomer(bakerId, customerId, payload);

  return reply.code(200).send({
    success: true,
    data: result,
  });
}
