import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError } from '../../shared/errors/index.js';

import { inventoryService } from './inventory.service.js';
import type {
  CreateInventoryItemBody,
  GetInventoryItemsQuery,
  UpdateInventoryItemBody,
  UpdateInventoryItemParams,
  DeleteInventoryItemParams,
} from './inventory.schemas.js';

function requireBakerId(req: FastifyRequest): string {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }
  return bakerId;
}

export async function createInventoryItem(
  req: FastifyRequest<{ Body: CreateInventoryItemBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await inventoryService.createItem(bakerId, req.body);
  return reply.code(201).send({ success: true, data: result });
}

export async function getInventoryItems(
  req: FastifyRequest<{ Querystring: GetInventoryItemsQuery }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await inventoryService.getItems(bakerId, req.query);
  return reply.code(200).send({ success: true, data: result });
}

export async function updateInventoryItem(
  req: FastifyRequest<{ Params: UpdateInventoryItemParams; Body: UpdateInventoryItemBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await inventoryService.updateItem(bakerId, req.params.itemId, req.body);
  return reply.code(200).send({ success: true, data: result });
}

export async function deleteInventoryItem(
  req: FastifyRequest<{ Params: DeleteInventoryItemParams }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  await inventoryService.deleteItem(bakerId, req.params.itemId);
  return reply.code(200).send({ success: true });
}
