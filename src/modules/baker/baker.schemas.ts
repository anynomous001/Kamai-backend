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

// ── PATCH /api/baker/profile ─────────────────────────────────
// logoPath is intentionally NOT here — it's written by the existing
// POST /api/uploads/confirm (category: BUSINESS_LOGO) flow, which already
// persists it via a signed-upload + confirm round trip.
export const UpdateBakerProfileBodySchema = z
  .object({
    ownerName: z.string().min(1).max(120).optional(),
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number').optional(),
    defaultAdvancePercentage: z.number().min(0).max(100).optional(),
    // Public order-contact number shown on the shareable menu (Action 26) —
    // distinct from `phone` above (login), no endpoint set this until now.
    whatsappNumber: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number').optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided' });

export type UpdateBakerProfileBody = z.infer<typeof UpdateBakerProfileBodySchema>;

// ── PATCH /api/baker/menu-slug ── (Action 26) ───────────────
export const UpdateMenuSlugBodySchema = z.object({
  menuSlug: z.string().min(1, 'menuSlug is required').max(60),
});

export type UpdateMenuSlugBody = z.infer<typeof UpdateMenuSlugBodySchema>;

export const UpdateMenuSlugSchema = {
  description:
    "One-time edit of the baker's shareable menu link slug. Rejects with 400 if the one-time edit has already been used, or if the requested slug is taken.",
  tags: ['Baker Profile'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['menuSlug'],
    properties: { menuSlug: { type: 'string', example: 'ananyas-home-bakery' } },
  },
  response: {
    200: {
      description: 'Menu slug updated',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'object', properties: { menuSlug: { type: 'string' } } },
      },
    },
    400: {
      description: 'Edit already used, slug taken, or invalid slug',
      type: 'object',
      properties: { success: { type: 'boolean' }, errorCode: { type: 'string' }, message: { type: 'string' } },
    },
  },
};

export const GetBakerProfileResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    business: z.object({
      businessName: z.string().nullable(),
      ownerName: z.string().nullable(),
      phone: z.string(),
      email: z.string().nullable(),
      logoUrl: z.string().nullable(),
      accountVerified: z.boolean(),
    }),
    menu: z.object({
      menuSlug: z.string().nullable(),
      menuSlugEditable: z.boolean(),
      whatsappNumber: z.string().nullable(),
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
      whatsappReceiptEnabled: z.boolean(),
      defaultAdvancePercentage: z.number().nullable(),
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

export const UpdateBakerProfileSchema = {
  description: 'Update baker owner name, phone, and/or default advance percentage',
  tags: ['Baker Profile'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    properties: {
      ownerName: { type: 'string', example: 'Priya Sharma' },
      phone: { type: 'string', example: '9876543210' },
      defaultAdvancePercentage: { type: 'number', minimum: 0, maximum: 100, example: 50 },
      whatsappNumber: { type: 'string', example: '9876543210' },
    },
  },
  response: {
    200: {
      description: 'Profile updated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            ownerName: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            defaultAdvancePercentage: { type: 'number', nullable: true },
            whatsappNumber: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    422: {
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
                accountVerified: { type: 'boolean' },
              },
            },
            menu: {
              type: 'object',
              properties: {
                menuSlug: { type: 'string', nullable: true },
                menuSlugEditable: { type: 'boolean' },
                whatsappNumber: { type: 'string', nullable: true },
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
                whatsappReceiptEnabled: { type: 'boolean' },
                defaultAdvancePercentage: { type: 'number', nullable: true },
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
