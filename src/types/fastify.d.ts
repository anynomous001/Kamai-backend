import type { FastifyRequest, FastifyReply } from 'fastify';

import type { AuthenticatedUser } from '../shared/types/index.js';

// Extend Fastify types to include authenticated user
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: (
      req: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

export type { FastifyRequest, FastifyReply };
