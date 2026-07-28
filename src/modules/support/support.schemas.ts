import { z } from 'zod';

export enum SupportIssueType {
  BILLING = 'BILLING',
  ORDERS = 'ORDERS',
  PAYMENTS = 'PAYMENTS',
  CUSTOMER_DIRECTORY = 'CUSTOMER_DIRECTORY',
  APP_BUG = 'APP_BUG',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  OTHER = 'OTHER',
}

export const CreateSupportChatBodySchema = z.object({
  issueType: z.nativeEnum(SupportIssueType),
  message: z.string().min(1, 'Message is required').max(2000, 'Message must be at most 2000 characters'),
});

export type CreateSupportChatBody = z.infer<typeof CreateSupportChatBodySchema>;

// Swagger Schema
export const CreateSupportChatSchema = {
  description: 'Generate a WhatsApp deep link to contact Kamai Support with pre-filled diagnostics',
  tags: ['Support'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['issueType', 'message'],
    properties: {
      issueType: {
        type: 'string',
        enum: Object.values(SupportIssueType),
        example: 'BILLING',
      },
      message: {
        type: 'string',
        maxLength: 2000,
        example: 'Unable to activate my subscription after payment.',
      },
    },
  },
  response: {
    200: {
      description: 'Support link generated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            issueType: { type: 'string' },
            whatsappUrl: { type: 'string' },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Bad Request — invalid input',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        errorCode: { type: 'string' },
        message: { type: 'string' },
      },
    },
    503: {
      description: 'Service Unavailable — SUPPORT_WHATSAPP_NUMBER not configured',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        errorCode: { type: 'string', example: 'SUPPORT_NOT_CONFIGURED' },
        message: { type: 'string' },
      },
    },
  },
};
