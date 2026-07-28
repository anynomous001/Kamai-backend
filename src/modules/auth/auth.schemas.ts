import { z } from 'zod';

// ── Request Zod Schemas ───────────────────────────────────────────

export const SendEmailOtpBodySchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email format'),
});

export type SendEmailOtpBody = z.infer<typeof SendEmailOtpBodySchema>;

export const VerifyEmailOtpBodySchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .trim()
    .toLowerCase()
    .email('Invalid email format'),
  otp: z
    .string({ required_error: 'otp is required' })
    .regex(/^\d{6}$/, 'OTP must be exactly 6 numeric digits'),
});

export type VerifyEmailOtpBody = z.infer<typeof VerifyEmailOtpBodySchema>;

// ── Response Shapes ───────────────────────────────────────────

export const BakerProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  status: z.enum(['PENDING_ONBOARDING', 'ACTIVE', 'SUSPENDED']),
  subscriptionStatus: z.enum(['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED']),
  businessName: z.string().nullable(),
  ownerName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  fssaiNumber: z.string().nullable(),
  upiId: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type BakerProfile = z.infer<typeof BakerProfileSchema>;

// ── Fastify JSON Schemas for Swagger / OpenAPI Documentation ────────

export const sendEmailOtpJsonSchema = {
  description: 'Generate and email a 6-digit verification OTP code to the baker email.',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        example: 'owner@mybakery.com',
        description: 'The email address to receive the verification OTP code.',
      },
    },
  },
  response: {
    200: {
      description: 'Verification OTP sent successfully.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Verification code sent successfully.' },
        expiresIn: { type: 'number', example: 300, description: 'OTP expiration time in seconds.' },
      },
    },
    429: {
      description: 'Rate limit exceeded (60s cooldown or max 5 per hour).',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Please wait 60 seconds before requesting another verification code.' },
        errorCode: { type: 'string', example: 'TOO_MANY_REQUESTS' },
      },
    },
    422: {
      description: 'Validation failed for request body.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Request validation failed' },
        errorCode: { type: 'string', example: 'VALIDATION_ERROR' },
        details: { type: 'object' },
      },
    },
  },
};

export const verifyEmailOtpJsonSchema = {
  description: 'Verify 6-digit email OTP, provision new tenant if first login, and issue HTTP-only JWT cookies.',
  tags: ['Auth'],
  body: {
    type: 'object',
    required: ['email', 'otp'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        example: 'owner@mybakery.com',
        description: 'The email address that received the OTP code.',
      },
      otp: {
        type: 'string',
        pattern: '^\\d{6}$',
        example: '483271',
        description: 'The 6-digit verification code sent via email.',
      },
    },
  },
  response: {
    200: {
      description: 'OTP verified successfully. Kamai session cookies are set.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        bakerId: { type: 'string', format: 'uuid', example: 'd3b07384-d113-460a-85d1-d227446543b5' },
        isNew: { type: 'boolean', example: true, description: 'true on first login — redirect to onboarding flow.' },
        message: { type: 'string', example: 'Authentication successful.' },
      },
    },
    401: {
      description: 'Incorrect OTP code entered.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Incorrect verification code.' },
        errorCode: { type: 'string', example: 'INVALID_CREDENTIALS' },
      },
    },
    410: {
      description: 'Verification OTP expired or already consumed.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Verification code expired or not found.' },
        errorCode: { type: 'string', example: 'OTP_EXPIRED' },
      },
    },
    429: {
      description: 'Maximum verification attempts (5) reached.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Maximum verification attempts reached. Please request a new code.' },
        errorCode: { type: 'string', example: 'OTP_MAX_ATTEMPTS_EXCEEDED' },
      },
    },
    422: {
      description: 'Validation failed for request body.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'Request validation failed' },
        errorCode: { type: 'string', example: 'VALIDATION_ERROR' },
        details: { type: 'object' },
      },
    },
  },
};

export const logoutJsonSchema = {
  description: 'Revoke the current Kamai application session and clear auth cookies.',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Logged out successfully.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Logged out successfully.' },
      },
    },
    401: {
      description: 'Unauthorized — Invalid or expired Kamai session.',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string', example: 'User session invalid or missing' },
        errorCode: { type: 'string', example: 'UNAUTHORIZED' },
      },
    },
  },
};
