import { z } from 'zod';

export const CreateOrderPayloadSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().optional(),
  }),
  cake: z.object({
    category: z.string().min(1),
    weight: z.string().min(1),
    flavour: z.string().min(1),
  }),
  delivery: z.object({
    date: z.string(), // "2026-07-30"
    time: z.string(), // "18:00"
  }),
  payment: z.object({
    totalPrice: z.number().int().min(0),
    advancePaid: z.number().int().min(0),
  }),
  referencePhoto: z.string().url().nullable().optional(),
});

export type CreateOrderPayload = z.infer<typeof CreateOrderPayloadSchema>;

export const CreateOrderResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    orderId: z.string().uuid(),
    orderNumber: z.string(),
    balanceDue: z.number().int(),
    status: z.string(),
  }),
});

// JSON Schema for Swagger documentation
export const createOrderJsonSchema = {
  description: 'Create a new order and upsert the customer in a single transaction',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  body: {
    type: 'object',
    required: ['customer', 'cake', 'delivery', 'payment'],
    properties: {
      customer: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          address: { type: 'string' },
        },
      },
      cake: {
        type: 'object',
        required: ['category', 'weight', 'flavour'],
        properties: {
          category: { type: 'string' },
          weight: { type: 'string' },
          flavour: { type: 'string' },
        },
      },
      delivery: {
        type: 'object',
        required: ['date', 'time'],
        properties: {
          date: { type: 'string' },
          time: { type: 'string' },
        },
      },
      payment: {
        type: 'object',
        required: ['totalPrice', 'advancePaid'],
        properties: {
          totalPrice: { type: 'integer' },
          advancePaid: { type: 'integer' },
        },
      },
      referencePhoto: { type: 'string', nullable: true },
    },
  },
  response: {
    200: {
      description: 'Order created successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'string', example: 'ORD-20260726-00001' },
            balanceDue: { type: 'integer', example: 1300 },
            status: { type: 'string', example: 'PENDING' },
          },
        },
      },
    },
  },
};

// ── GET /api/orders (Order History) ─────────────────────────────────

export const GetOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED']).optional(),
  search: z.string().optional(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
  sort: z.enum(['deliveryDate', 'createdAt', 'totalPrice']).default('deliveryDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
}).refine(data => !(data.deliveryDate && (data.from || data.to)), {
  message: 'Use either deliveryDate or from/to filters, not both.',
  path: ['deliveryDate'],
});

export type GetOrdersQuery = z.infer<typeof GetOrdersQuerySchema>;

// JSON Schema for Swagger documentation
export const getOrdersJsonSchema = {
  description: 'Retrieve paginated order history with filtering and sorting',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: ['integer', 'string'], default: 1 },
      limit: { type: ['integer', 'string'], default: 20 },
      status: { 
        type: 'string', 
        enum: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'],
        description: 'Filter by exact order status',
      },
      search: { type: 'string', description: 'Search customer name, phone, or order number' },
      deliveryDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' },
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' },
      to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD' },
      sort: { type: 'string', enum: ['deliveryDate', 'createdAt', 'totalPrice'], default: 'deliveryDate' },
      order: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
    },
  },
  response: {
    200: {
      description: 'Paginated list of orders',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            orders: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  orderId: { type: 'string', format: 'uuid' },
                  orderNumber: { type: 'string' },
                  customerName: { type: 'string' },
                  phone: { type: 'string' },
                  deliveryDate: { type: 'string', format: 'date-time' },
                  status: { type: 'string' },
                  totalPrice: { type: 'integer' },
                  balanceDue: { type: 'integer' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                totalItems: { type: 'integer' },
                totalPages: { type: 'integer' },
                hasNext: { type: 'boolean' },
                hasPrevious: { type: 'boolean' },
              },
            },
          },
        },
      },
    },
  },
};

// ── GET /api/orders/:orderNumber (Order Details) ────────────────────

export const GetOrderParamsSchema = z.object({
  orderNumber: z.string().min(1),
});

export type GetOrderParams = z.infer<typeof GetOrderParamsSchema>;

// Note: The response schema matches the DTO requested in Action 6
export const GetOrderResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    orderId: z.string(), // e.g. ORD-10293
    status: z.string(),
    customer: z.object({
      name: z.string(),
      phone: z.string(),
      address: z.string().nullable().optional(),
    }),
    cake: z.object({
      category: z.string(),
      weight: z.string(),
      flavour: z.string(),
    }),
    delivery: z.object({
      date: z.string(),
      time: z.string(),
    }),
    payment: z.object({
      totalPrice: z.number().int(),
      advancePaid: z.number().int(),
      balanceDue: z.number().int(),
    }),
    referencePhoto: z.string().nullable().optional(),
  }),
});

export const getOrderJsonSchema = {
  description: 'Retrieve complete order details by orderNumber',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: {
      orderNumber: { type: 'string', description: 'The public order number (e.g., ORD-20260726-00001)' },
    },
  },
  response: {
    200: {
      description: 'Order details',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            status: { type: 'string' },
            customer: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: 'string' },
                address: { type: 'string', nullable: true },
              },
            },
            cake: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                weight: { type: 'string' },
                flavour: { type: 'string' },
              },
            },
            delivery: {
              type: 'object',
              properties: {
                date: { type: 'string' },
                time: { type: 'string' },
              },
            },
            payment: {
              type: 'object',
              properties: {
                totalPrice: { type: 'integer' },
                advancePaid: { type: 'integer' },
                balanceDue: { type: 'integer' },
              },
            },
            referencePhoto: { type: 'string', nullable: true },
          },
        },
      },
    },
    404: {
      description: 'Order not found',
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        error: { type: 'string' },
        message: { type: 'string' },
      },
    },
  },
};

// ── PATCH /api/orders/:orderNumber/status (Update Status) ───────────

export const UpdateOrderStatusParamsSchema = z.object({
  orderNumber: z.string().min(1),
});

export const UpdateOrderStatusBodySchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED']),
});

export type UpdateOrderStatusParams = z.infer<typeof UpdateOrderStatusParamsSchema>;
export type UpdateOrderStatusBody = z.infer<typeof UpdateOrderStatusBodySchema>;

export const UpdateOrderStatusResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    orderId: z.string(), // Maps to the DB UUID inside standard endpoints, but user asked for orderNumber here
    orderNumber: z.string(),
    previousStatus: z.string(),
    currentStatus: z.string(),
    updatedAt: z.string(),
  }),
});

export const updateOrderStatusJsonSchema = {
  description: 'Update an order status along the production lifecycle',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: {
      orderNumber: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        enum: ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'],
      },
    },
  },
  response: {
    200: {
      description: 'Status successfully updated',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'string' },
            previousStatus: { type: 'string' },
            currentStatus: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    409: {
      description: 'Invalid status transition',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        message: { type: 'string' },
        errorCode: { type: 'string', example: 'INVALID_ORDER_STATUS_TRANSITION' },
      },
    },
  },
};

// ── PATCH /api/orders/:orderNumber/payment (Record Payment) ─────────

export const RecordPaymentParamsSchema = z.object({
  orderNumber: z.string().min(1),
});

export const RecordPaymentBodySchema = z.object({
  amountReceived: z.number().int().positive('Amount must be greater than 0'),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER']),
  transactionReference: z.string().optional(),
});

export type RecordPaymentParams = z.infer<typeof RecordPaymentParamsSchema>;
export type RecordPaymentBody = z.infer<typeof RecordPaymentBodySchema>;

export const recordPaymentJsonSchema = {
  description: 'Record a balance payment for an order',
  tags: ['Orders', 'Finance'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: {
      orderNumber: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['amountReceived', 'paymentMethod'],
    properties: {
      amountReceived: { type: 'integer', minimum: 1, description: 'Amount in paise' },
      paymentMethod: { type: 'string', enum: ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'] },
      transactionReference: { type: 'string' },
    },
  },
  response: {
    200: {
      description: 'Payment recorded successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            orderNumber: { type: 'string' },
            amountReceived: { type: 'integer' },
            balanceDue: { type: 'integer' },
            paymentStatus: { type: 'string' },
            paymentMethod: { type: 'string' },
            transactionDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Invalid payment amount',
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        error: { type: 'string' },
        message: { type: 'string' },
      },
    },
    409: {
      description: 'Order already paid',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};

// ── PUT /api/orders/:orderNumber (Update Order) ─────────────────────

export const UpdateOrderParamsSchema = z.object({
  orderNumber: z.string().min(1),
});

export const UpdateOrderBodySchema = z.object({
  customer: z.object({
    name: z.string().min(1, 'Customer name is required'),
    phone: z.string().regex(/^\d{10}$/, 'Phone number must be exactly 10 digits'),
    address: z.string().optional(),
  }),
  cake: z.object({
    category: z.string().min(1, 'Cake category is required'),
    weight: z.string().min(1, 'Cake weight is required'),
    flavour: z.string().min(1, 'Cake flavour is required'),
  }),
  delivery: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Delivery date must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Delivery time must be HH:MM'),
  }),
  payment: z.object({
    totalPrice: z.number().int().min(0, 'Total price cannot be negative'),
    advancePaid: z.number().int().min(0, 'Advance paid cannot be negative'),
  }),
  referencePhoto: z.string().url().nullable().optional(),
}).refine((data) => data.payment.advancePaid <= data.payment.totalPrice, {
  message: 'Advance paid cannot exceed total price',
  path: ['payment', 'advancePaid'],
});

export type UpdateOrderParams = z.infer<typeof UpdateOrderParamsSchema>;
export type UpdateOrderBody = z.infer<typeof UpdateOrderBodySchema>;

export const updateOrderJsonSchema = {
  description: 'Update an existing order (Full replacement of editable fields)',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: {
      orderNumber: { type: 'string' },
    },
  },
  body: {
    type: 'object',
    required: ['customer', 'cake', 'delivery', 'payment'],
    properties: {
      customer: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          address: { type: 'string' },
        },
      },
      cake: {
        type: 'object',
        required: ['category', 'weight', 'flavour'],
        properties: {
          category: { type: 'string' },
          weight: { type: 'string' },
          flavour: { type: 'string' },
        },
      },
      delivery: {
        type: 'object',
        required: ['date', 'time'],
        properties: {
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
        },
      },
      payment: {
        type: 'object',
        required: ['totalPrice', 'advancePaid'],
        properties: {
          totalPrice: { type: 'integer', minimum: 0 },
          advancePaid: { type: 'integer', minimum: 0 },
        },
      },
      referencePhoto: { type: ['string', 'null'], format: 'uri' },
    },
  },
  response: {
    200: {
      description: 'Order updated successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            orderId: { type: 'string' },
            orderNumber: { type: 'string' },
            customerName: { type: 'string' },
            deliveryDate: { type: 'string', format: 'date-time' },
            totalPrice: { type: 'integer' },
            advancePaid: { type: 'integer' },
            balanceDue: { type: 'integer' },
            paymentStatus: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Validation failed',
      type: 'object',
      properties: {
        statusCode: { type: 'integer' },
        error: { type: 'string' },
        message: { type: 'string' },
      },
    },
    409: {
      description: 'Conflict (Cannot edit delivered order or phone conflict)',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};

// ── DELETE /api/orders/:orderNumber (Cancel / Archive Order) ─────────────

export const CancelOrderParamsSchema = z.object({
  orderNumber: z.string().min(1),
});

export type CancelOrderParams = z.infer<typeof CancelOrderParamsSchema>;

export const cancelOrderJsonSchema = {
  description: 'Cancel and logically archive an order',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: {
      orderNumber: { type: 'string' },
    },
  },
  response: {
    200: {
      description: 'Order cancelled successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            orderNumber: { type: 'string' },
            status: { type: 'string' },
            cancelledAt: { type: 'string', format: 'date-time' },
            message: { type: 'string' },
          },
        },
      },
    },
    409: {
      description: 'Conflict (Cannot cancel delivered or already cancelled order)',
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};
