import type { FastifyInstance } from 'fastify';
import { logout, refresh, sendEmailOtp, verifyEmailOtp } from './auth.controller.js';
import {
  sendEmailOtpJsonSchema,
  verifyEmailOtpJsonSchema,
  refreshJsonSchema,
  logoutJsonSchema,
} from './auth.schemas.js';

/**
 * Auth Routes
 *
 * Registered in app.ts with prefix: /api/auth
 *
 * Routes:
 *   POST /api/auth/send-email-otp   — Request 6-digit verification code sent via Resend
 *   POST /api/auth/verify-email-otp — Verify OTP, provision tenant, issue JWT session cookies
 *   POST /api/auth/refresh          — Rotate refresh token for a new access/refresh pair
 *   POST /api/auth/logout           — Revoke current session + clear auth cookies
 */
export async function authRoutes(app: FastifyInstance) {
  app.post('/send-email-otp', {
    schema: sendEmailOtpJsonSchema,
    handler: sendEmailOtp,
  });

  app.post('/verify-email-otp', {
    schema: verifyEmailOtpJsonSchema,
    handler: verifyEmailOtp,
  });

  // No `preHandler: [app.authenticate]` — the access token may already be
  // expired, which is precisely the case this endpoint exists to recover from.
  app.post('/refresh', {
    schema: refreshJsonSchema,
    handler: refresh,
  });

  app.post('/logout', {
    schema: logoutJsonSchema,
    preHandler: [app.authenticate],
    handler: logout,
  });
}
