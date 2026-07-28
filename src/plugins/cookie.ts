import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import { env } from '../config/env.js';

export const cookiePlugin = fp(async (app) => {
  await app.register(cookie, {
    secret: env.COOKIE_SECRET ?? 'fallback-dev-secret-change-in-production',
    hook: 'onRequest',
    parseOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
    },
  });
});
