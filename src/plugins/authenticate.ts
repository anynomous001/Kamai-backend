import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../modules/auth/jwt.service.js';
import { UnauthorizedError } from '../shared/errors/index.js';
import { env } from '../config/env.js';



/**
 * Authentication Plugin
 *
 * Exposes an `authenticate` decorator that can be used as a `preHandler` hook
 * to protect routes. It expects a valid `kamai_access_token` cookie.
 */
export const authenticatePlugin = fp(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (app: FastifyInstance) => {
    app.decorate(
      'authenticate',
      async (req: FastifyRequest, _reply: FastifyReply) => {
        // Development Authentication Bypass (only when no auth cookie is provided)
        if (env.NODE_ENV !== 'production' && env.DEV_BYPASS_AUTH && !req.cookies.kamai_access_token) {
          const bakerId = env.DEV_BAKER_ID || 'dev-baker-id';
          const phone = env.DEV_PHONE || '+919999999999';
          const sessionId = env.DEV_SESSION_ID || 'dev-session';
          req.user = {
            id: bakerId,
            bakerId,
            phoneNumber: phone,
            phone,
            sessionId,
          };
          return;
        }

        const token = req.cookies.kamai_access_token;

        if (!token) {
          throw new UnauthorizedError(
            'Missing authentication token',
            'TOKEN_INVALID',
          );
        }

        try {
          const decoded = await verifyAccessToken(token);
          req.user = {
            id: decoded.sub,
            bakerId: decoded.sub,
            email: decoded.email,
            phoneNumber: decoded.phoneNumber,
            sessionId: decoded.sessionId,
          };
        } catch (error) {
          // Token is invalid or expired
          throw new UnauthorizedError(
            'Invalid or expired authentication token',
            'TOKEN_EXPIRED',
          );
        }
      },
    );
  },
  {
    name: 'authenticate',
  },
);
