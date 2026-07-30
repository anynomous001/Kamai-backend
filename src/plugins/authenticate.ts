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
        // Development Authentication Bypass — only for a genuinely fresh/
        // anonymous request (no access token AND no refresh token cookie).
        // Previously this checked only the access token's absence, which
        // silently substituted the phantom DEV_BAKER_ID identity the
        // instant a real session's short-lived access token expired
        // (browser drops the cookie once its maxAge elapses) — a real
        // logged-in user would see someone else's data with no error and
        // no indication their session had died. A refresh token cookie
        // (7-day maxAge, long outliving the 15-min access token) is
        // reliable evidence a real session exists, so its presence now
        // hard-disqualifies the bypass — that request instead falls
        // through to the real 401 path below, which the frontend's
        // refresh-and-retry handling can act on.
        if (
          env.NODE_ENV !== 'production' &&
          env.DEV_BYPASS_AUTH &&
          !req.cookies.kamai_access_token &&
          !req.cookies.kamai_refresh_token
        ) {
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
