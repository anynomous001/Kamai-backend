import { z } from 'zod';

export const SUPPORTED_PAYMENT_APPS = [
  'Google Pay',
  'PhonePe',
  'Paytm',
  'BHIM',
  'Amazon Pay',
  'Other',
] as const;

export const UpdateUpiSettingsBodySchema = z.object({
  upiId: z
    .string()
    .regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/, 'Invalid UPI ID format'),
  merchantName: z.string().optional(),
  preferredApps: z
    .array(z.enum(SUPPORTED_PAYMENT_APPS))
    .optional(),
  defaultCollectionMethod: z.enum(['UPI', 'QR']).optional(),
  generateDynamicQR: z.boolean().optional(),
});

export type UpdateUpiSettingsBody = z.infer<typeof UpdateUpiSettingsBodySchema>;

export const GetBakerProfileResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    business: z.object({
      businessName: z.string().nullable(),
      ownerName: z.string().nullable(),
      phone: z.string(),
      email: z.string().nullable(),
      logoUrl: z.string().nullable(),
    }),
    verification: z.object({
      fssaiNumber: z.string().nullable(),
      fssaiVerified: z.boolean(),
      fssaiDocumentUrl: z.string().nullable(),
    }),
    payment: z.object({
      upiId: z.string().nullable(),
      merchantName: z.string().nullable(),
      defaultCollectionMethod: z.string(),
      dynamicQrEnabled: z.boolean(),
    }),
    subscription: z.object({
      plan: z.string().nullable(),
      status: z.string(),
      trialEndsOn: z.string().nullable(),
      trialDaysRemaining: z.number(),
      nextBillingDate: z.string().nullable(),
    }),
  }),
});

// Swagger schemas for Swagger
export const UpdateUpiSettingsSchema = {
  description: 'Update baker payment/UPI settings',
  tags: ['Baker'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['upiId'],
    properties: {
      upiId: { type: 'string', example: 'kamai@okaxis' },
      merchantName: { type: 'string', example: 'Kamai Bakery' },
      preferredApps: {
        type: 'array',
        items: {
          type: 'string',
          enum: SUPPORTED_PAYMENT_APPS,
        },
        example: ['Google Pay', 'PhonePe'],
      },
      defaultCollectionMethod: { type: 'string', enum: ['UPI', 'QR'], example: 'UPI' },
      generateDynamicQR: { type: 'boolean', example: true },
    },
  },
  response: {
    200: {
      description: 'Successfully updated UPI settings',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            upiId: { type: 'string' },
            merchantName: { type: 'string' },
            preferredApps: { type: 'array', items: { type: 'string' } },
            defaultCollectionMethod: { type: 'string' },
            dynamicQrEnabled: { type: 'boolean' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Validation Error',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        errorCode: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

export const GetBakerProfileSchema = {
  description: 'Get baker business profile and settings',
  tags: ['Baker Profile'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Baker profile retrieved successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            business: {
              type: 'object',
              properties: {
                businessName: { type: 'string', nullable: true },
                ownerName: { type: 'string', nullable: true },
                phone: { type: 'string' },
                email: { type: 'string', nullable: true },
                logoUrl: { type: 'string', nullable: true },
              },
            },
            verification: {
              type: 'object',
              properties: {
                fssaiNumber: { type: 'string', nullable: true },
                fssaiVerified: { type: 'boolean' },
                fssaiDocumentUrl: { type: 'string', nullable: true },
              },
            },
            payment: {
              type: 'object',
              properties: {
                upiId: { type: 'string', nullable: true },
                merchantName: { type: 'string', nullable: true },
                defaultCollectionMethod: { type: 'string' },
                dynamicQrEnabled: { type: 'boolean' },
              },
            },
            subscription: {
              type: 'object',
              properties: {
                plan: { type: 'string', nullable: true },
                status: { type: 'string' },
                trialEndsOn: { type: 'string', nullable: true },
                trialDaysRemaining: { type: 'number' },
                nextBillingDate: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  },
};
