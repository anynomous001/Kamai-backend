export const generateReceiptImageJsonSchema = {
  description:
    'Generate a branded receipt image (PNG) for an order, server-side, on demand. Returns a signed image URL for the frontend to fetch and attach via the Web Share API — not a raw binary. Requires whatsappReceiptEnabled=true on the baker profile.',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: { orderNumber: { type: 'string' } },
  },
  response: {
    200: {
      description: 'Receipt image generated',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            orderNumber: { type: 'string' },
            imageUrl: { type: 'string' },
            expiresIn: { type: 'number' },
            generatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    403: {
      description: 'WhatsApp receipts are disabled for this baker profile',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
    404: {
      description: 'Order not found',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};
