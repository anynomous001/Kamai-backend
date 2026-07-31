import type { FastifyRequest, FastifyReply } from 'fastify';

import { InternalServerError } from '../../shared/errors/index.js';

import {
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  deleteMenuItem,
  reorderMenuItems,
} from './menu-items.service.js';
import type { CreateMenuItemBody, UpdateMenuItemBody, ReorderMenuItemsBody } from './menu-items.schemas.js';

function requireBakerId(req: FastifyRequest): string {
  const bakerId = req.user?.id;
  if (!bakerId) {
    throw new InternalServerError('Baker context is missing in authenticated request');
  }
  return bakerId;
}

export async function createMenuItemHandler(
  req: FastifyRequest<{ Body: CreateMenuItemBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await createMenuItem(bakerId, req.body);

  return reply.code(201).send({ success: true, data: result });
}

export async function getMenuItemsHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await getMenuItems(bakerId);

  return reply.code(200).send({ success: true, data: result });
}

export async function updateMenuItemHandler(
  req: FastifyRequest<{ Params: { id: string }; Body: UpdateMenuItemBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await updateMenuItem(bakerId, req.params.id, req.body);

  return reply.code(200).send({ success: true, data: result });
}

export async function deleteMenuItemHandler(
  req: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  await deleteMenuItem(bakerId, req.params.id);

  return reply.code(200).send({ success: true });
}

export async function reorderMenuItemsHandler(
  req: FastifyRequest<{ Body: ReorderMenuItemsBody }>,
  reply: FastifyReply,
): Promise<void> {
  const bakerId = requireBakerId(req);
  const result = await reorderMenuItems(bakerId, req.body.menuItemIds);

  return reply.code(200).send({ success: true, data: result });
}
