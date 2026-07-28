import type { FastifyInstance } from 'fastify';
import { logout, sendEmailOtp, verifyEmailOtp } from './auth.controller.js';
import { sendEmailOtpJsonSchema, verifyEmailOtpJsonSchema, logoutJsonSchema } from './auth.schemas.js';

/**
 * Auth Routes
 *
 * Registered in app.ts with prefix: /api/auth
 *
 * Routes:
 *   POST /api/auth/send-email-otp   — Request 6-digit verification code sent via Resend
 *   POST /api/auth/verify-email-otp — Verify OTP, provision tenant, issue JWT session cookies
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

  app.post('/logout', {
    schema: logoutJsonSchema,
    preHandler: [app.authenticate],
    handler: logout,
  });
}
