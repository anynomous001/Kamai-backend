import { z } from 'zod';

const ORDER_STATUS_VALUES = ['Pending', 'Confirmed', 'In Progress', 'Ready', 'Delivered', 'Cancelled'] as const;
const DELIVERY_TYPE_VALUES = ['pickup', 'delivery'] as const;
const PAYMENT_MODE_VALUES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER'] as const;

export const CustomFieldSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
});

// ── POST /api/orders (Create Order) ─────────────────────────────────

export const CreateOrderPayloadSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(1).nullable().optional(), // nullable — real intake often has no phone
    address: z.string().optional(),
  }),
  cake: z.object({
    category: z.string().min(1),
    flavour: z.string().min(1),
    weightInPounds: z.number().positive().optional(),
    quantity: z.number().positive().optional(),
  }),
  occasion: z.string().optional(),
  customInstructions: z.string().optional(),
  delivery: z.object({
    type: z.enum(DELIVERY_TYPE_VALUES),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:MM').optional(),
    charge: z.number().min(0).optional(), // coerced to 0 for pickup at the service layer
  }),
  payment: z.object({
    totalPrice: z.number().positive(),
    advancePaid: z.number().min(0).default(0),
    paymentMethod: z.enum(PAYMENT_MODE_VALUES).default('CASH'), // how the advance (if any) was collected
    forceConfirm: z.boolean().default(false), // set order_status = Confirmed even with advancePaid = 0; not persisted
  }),
  referencePhotoUrl: z.string().url().nullable().optional(),
  internalNotes: z.string().optional(),
  customFields: z.array(CustomFieldSchema).max(10).optional(),
}).refine((data) => data.payment.advancePaid <= data.payment.totalPrice, {
  message: 'Advance paid cannot exceed total price',
  path: ['payment', 'advancePaid'],
});

export type CreateOrderPayload = z.infer<typeof CreateOrderPayloadSchema>;

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
        required: ['name'],
        properties: {
          name: { type: 'string' },
          // AJV's `pattern` keyword only applies when the instance is a
          // string, so a `null` phone (no-phone-on-file customers) still
          // passes — matches CreateOrderPayloadSchema's regex, which this
          // JSON schema is the actual runtime enforcement for (that Zod
          // schema is never .parse()'d anywhere; it's type-inference only).
          phone: { type: ['string', 'null'], pattern: '^[6-9]\\d{9}$' },
          address: { type: 'string' },
        },
      },
      cake: {
        type: 'object',
        required: ['category', 'flavour'],
        properties: {
          category: { type: 'string' },
          flavour: { type: 'string' },
          weightInPounds: { type: 'number', exclusiveMinimum: 0 },
          quantity: { type: 'number', exclusiveMinimum: 0 },
        },
      },
      occasion: { type: 'string' },
      customInstructions: { type: 'string' },
      delivery: {
        type: 'object',
        required: ['type', 'date'],
        properties: {
          type: { type: 'string', enum: DELIVERY_TYPE_VALUES as unknown as string[] },
          date: { type: 'string' },
          time: { type: 'string' },
          charge: { type: 'number', minimum: 0 },
        },
      },
      payment: {
        type: 'object',
        required: ['totalPrice'],
        properties: {
          totalPrice: { type: 'number', exclusiveMinimum: 0 },
          advancePaid: { type: 'number', minimum: 0, default: 0 },
          paymentMethod: { type: 'string', enum: PAYMENT_MODE_VALUES as unknown as string[], default: 'CASH' },
          forceConfirm: { type: 'boolean', default: false },
        },
      },
      referencePhotoUrl: { type: 'string', nullable: true },
      internalNotes: { type: 'string' },
      customFields: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, value: { type: 'string' } },
        },
      },
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
            orderNumber: { type: 'string', example: 'ORD-000001' },
            balanceDue: { type: 'number', example: 1300 },
            status: { type: 'string' },
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
  status: z.enum(ORDER_STATUS_VALUES).optional(),
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

export const getOrdersJsonSchema = {
  description: 'Retrieve paginated order history with filtering and sorting',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: ['integer', 'string'], default: 1 },
      limit: { type: ['integer', 'string'], default: 20 },
      status: { type: 'string', enum: ORDER_STATUS_VALUES as unknown as string[], description: 'Filter by exact order status; defaults to excluding Cancelled when omitted' },
      search: { type: 'string', description: 'Search customer name, phone, or order number' },
      deliveryDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
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
                  phone: { type: ['string', 'null'] },
                  deliveryDate: { type: 'string', format: 'date' },
                  status: { type: 'string' },
                  totalPrice: { type: 'number' },
                  balanceDue: { type: 'number' },
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

export const getOrderJsonSchema = {
  description: 'Retrieve complete order details by orderNumber (display_id)',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: {
      orderNumber: { type: 'string', description: 'The public order code (e.g., ORD-000001)' },
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
            id: { type: 'string', format: 'uuid', description: 'Internal UUID — use this for endpoints keyed off the order id (e.g. POST /api/notifications/whatsapp), not orderId.' },
            orderId: { type: 'string', description: 'Display id (e.g. "ORD-000001"), not a UUID — do not confuse with the same-named field on GET /api/orders, which is the UUID there.' },
            status: { type: 'string' },
            customer: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                phone: { type: ['string', 'null'] },
                address: { type: 'string', nullable: true },
              },
            },
            cake: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                flavour: { type: 'string' },
                weightInPounds: { type: 'number', nullable: true },
                quantity: { type: 'number', nullable: true },
              },
            },
            occasion: { type: 'string', nullable: true },
            customInstructions: { type: 'string', nullable: true },
            delivery: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                date: { type: 'string' },
                time: { type: 'string', nullable: true },
                charge: { type: 'number', nullable: true },
              },
            },
            payment: {
              type: 'object',
              properties: {
                totalPrice: { type: 'number' },
                advancePaid: { type: 'number' },
                balanceDue: { type: 'number' },
                paymentStatus: { type: 'string' },
              },
            },
            referencePhotoUrl: { type: 'string', nullable: true },
            internalNotes: { type: 'string', nullable: true },
            customFields: {
              type: 'array',
              items: {
                type: 'object',
                properties: { label: { type: 'string' }, value: { type: 'string' } },
              },
              nullable: true,
            },
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
  status: z.enum(ORDER_STATUS_VALUES),
});

export type UpdateOrderStatusParams = z.infer<typeof UpdateOrderStatusParamsSchema>;
export type UpdateOrderStatusBody = z.infer<typeof UpdateOrderStatusBodySchema>;

export const updateOrderStatusJsonSchema = {
  description: 'Update an order status along the production lifecycle',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: { orderNumber: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: { status: { type: 'string', enum: ORDER_STATUS_VALUES as unknown as string[] } },
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
  amountReceived: z.number().positive('Amount must be greater than 0'),
  paymentMethod: z.enum(PAYMENT_MODE_VALUES),
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
    properties: { orderNumber: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['amountReceived', 'paymentMethod'],
    properties: {
      amountReceived: { type: 'number', exclusiveMinimum: 0, description: 'Amount in rupees' },
      paymentMethod: { type: 'string', enum: PAYMENT_MODE_VALUES as unknown as string[] },
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
            amountReceived: { type: 'number' },
            balanceDue: { type: 'number' },
            paymentStatus: { type: 'string' },
            orderStatus: { type: 'string' },
            paymentMethod: { type: 'string' },
            transactionDate: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Invalid payment amount',
      type: 'object',
      properties: { statusCode: { type: 'integer' }, error: { type: 'string' }, message: { type: 'string' } },
    },
    409: {
      description: 'Order already paid',
      type: 'object',
      properties: { success: { type: 'boolean' }, message: { type: 'string' }, errorCode: { type: 'string' } },
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
    phone: z.string().regex(/^[6-9]\d{9}$/, 'Must be a valid 10-digit Indian mobile number').nullable().optional(),
    address: z.string().optional(),
  }),
  cake: z.object({
    category: z.string().min(1, 'Cake category is required'),
    flavour: z.string().min(1, 'Cake flavour is required'),
    weightInPounds: z.number().positive().optional(),
    quantity: z.number().positive().optional(),
  }),
  occasion: z.string().optional(),
  customInstructions: z.string().optional(),
  delivery: z.object({
    type: z.enum(DELIVERY_TYPE_VALUES),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Delivery date must be YYYY-MM-DD'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Delivery time must be HH:MM').optional(),
    charge: z.number().min(0).optional(),
  }),
  payment: z.object({
    totalPrice: z.number().positive('Total price must be greater than 0'),
    advancePaid: z.number().min(0, 'Advance paid cannot be negative'),
  }),
  referencePhotoUrl: z.string().url().nullable().optional(),
  internalNotes: z.string().optional(),
  customFields: z.array(CustomFieldSchema).max(10).optional(),
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
    properties: { orderNumber: { type: 'string' } },
  },
  body: {
    type: 'object',
    required: ['customer', 'cake', 'delivery', 'payment'],
    properties: {
      customer: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, phone: { type: ['string', 'null'] }, address: { type: 'string' } },
      },
      cake: {
        type: 'object',
        required: ['category', 'flavour'],
        properties: {
          category: { type: 'string' },
          flavour: { type: 'string' },
          weightInPounds: { type: 'number', exclusiveMinimum: 0 },
          quantity: { type: 'number', exclusiveMinimum: 0 },
        },
      },
      occasion: { type: 'string' },
      customInstructions: { type: 'string' },
      delivery: {
        type: 'object',
        required: ['type', 'date'],
        properties: {
          type: { type: 'string', enum: DELIVERY_TYPE_VALUES as unknown as string[] },
          date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
          charge: { type: 'number', minimum: 0 },
        },
      },
      payment: {
        type: 'object',
        required: ['totalPrice', 'advancePaid'],
        properties: {
          totalPrice: { type: 'number', exclusiveMinimum: 0 },
          advancePaid: { type: 'number', minimum: 0 },
        },
      },
      referencePhotoUrl: { type: ['string', 'null'], format: 'uri' },
      internalNotes: { type: 'string' },
      customFields: { type: 'array', maxItems: 10, items: { type: 'object' } },
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
            deliveryDate: { type: 'string', format: 'date' },
            totalPrice: { type: 'number' },
            advancePaid: { type: 'number' },
            balanceDue: { type: 'number' },
            paymentStatus: { type: 'string' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: {
      description: 'Validation failed',
      type: 'object',
      properties: { statusCode: { type: 'integer' }, error: { type: 'string' }, message: { type: 'string' } },
    },
    409: {
      description: 'Conflict (Cannot edit delivered/cancelled order or phone conflict)',
      type: 'object',
      properties: { success: { type: 'boolean' }, message: { type: 'string' }, errorCode: { type: 'string' } },
    },
  },
};

// ── DELETE /api/orders/:orderNumber (Cancel Order) ─────────────────

export const CancelOrderParamsSchema = z.object({
  orderNumber: z.string().min(1),
});

export type CancelOrderParams = z.infer<typeof CancelOrderParamsSchema>;

export const cancelOrderJsonSchema = {
  description: 'Cancel an order (order_status = Cancelled)',
  tags: ['Orders'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['orderNumber'],
    properties: { orderNumber: { type: 'string' } },
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
      properties: { success: { type: 'boolean' }, message: { type: 'string' }, errorCode: { type: 'string' } },
    },
  },
};
