import { z } from 'zod';
export enum UploadCategory {
  BUSINESS_LOGO = 'BUSINESS_LOGO',
  FSSAI_DOCUMENT = 'FSSAI_DOCUMENT',
}

export const GenerateUploadUrlBodySchema = z.object({
  contentType: z.string(),
  category: z.nativeEnum(UploadCategory),
  originalFilename: z.string().optional(),
});

export type GenerateUploadUrlBody = z.infer<typeof GenerateUploadUrlBodySchema>;

export const ConfirmUploadBodySchema = z.object({
  filePath: z.string(),
  category: z.nativeEnum(UploadCategory),
});

export type ConfirmUploadBody = z.infer<typeof ConfirmUploadBodySchema>;

// Swagger Schemas
export const GenerateUploadUrlSchema = {
  description: 'Generate a signed URL to upload a business asset directly to storage',
  tags: ['Uploads'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['contentType', 'category'],
    properties: {
      contentType: { type: 'string', example: 'image/webp' },
      category: { type: 'string', enum: Object.values(UploadCategory), example: 'BUSINESS_LOGO' },
      originalFilename: { type: 'string', example: 'logo.webp' },
    },
  },
  response: {
    200: {
      description: 'Signed URL generated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            uploadUrl: { type: 'string' },
            filePath: { type: 'string' },
            expiresIn: { type: 'number' },
          },
        },
      },
    },
  },
};

export const ConfirmUploadSchema = {
  description: 'Confirm a successful client-side upload to object storage',
  tags: ['Uploads'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['filePath', 'category'],
    properties: {
      filePath: { type: 'string', example: 'business/123/logo/abc.png' },
      category: { type: 'string', enum: Object.values(UploadCategory), example: 'BUSINESS_LOGO' },
    },
  },
  response: {
    200: {
      description: 'Upload confirmed and baker profile updated',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            filePath: { type: 'string' },
            uploadedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
};
