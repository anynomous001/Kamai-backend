import { z } from 'zod';

export enum WhatsAppNotificationTemplate {
  ORDER_CONFIRMATION = 'ORDER_CONFIRMATION',
  PAYMENT_REMINDER = 'PAYMENT_REMINDER',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  RECEIPT = 'RECEIPT',
  THANK_YOU = 'THANK_YOU',
}

export const GenerateWhatsAppLinkBodySchema = z.object({
  orderId: z.string().uuid(),
  template: z.nativeEnum(WhatsAppNotificationTemplate),
});

export type GenerateWhatsAppLinkBody = z.infer<typeof GenerateWhatsAppLinkBodySchema>;

// Swagger Schema
export const GenerateWhatsAppLinkSchema = {
  description: 'Generate a WhatsApp deep link for order notifications',
  tags: ['Notifications'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['orderId', 'template'],
    properties: {
      orderId: { type: 'string', format: 'uuid', example: 'uuid-here' },
      template: {
        type: 'string',
        enum: Object.values(WhatsAppNotificationTemplate),
        example: 'PAYMENT_REMINDER',
      },
    },
  },
  response: {
    200: {
      description: 'Successfully generated WhatsApp URL',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            template: { type: 'string' },
            orderNumber: { type: 'string' },
            whatsappUrl: { type: 'string' },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Bad Request (e.g., customer phone missing)',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        errorCode: { type: 'string' },
        message: { type: 'string' },
      },
    },
    404: {
      description: 'Order not found',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        errorCode: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};
