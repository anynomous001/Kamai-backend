import { z } from 'zod';

// ── Shared Schemas ──

export const InvestmentResponseSchema = z.object({
  id: z.string().uuid(),
  displayId: z.string(),
  category: z.string(),
  description: z.string().nullable(),
  materialName: z.string(),
  quantity: z.number(),
  unit: z.string(),
  pricePerUnit: z.number(),
  totalCost: z.number(),
  supplierName: z.string().nullable(),
  purchaseDate: z.string(), // YYYY-MM-DD
});

// ── POST /api/investments ──

export const CreateInvestmentBodySchema = z.object({
  category: z.string().min(1, 'Category is required'),
  description: z.string().optional(),
  materialName: z.string().min(1, 'Material name is required'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  unit: z.string().min(1, 'Unit is required'),
  pricePerUnit: z.number().positive('Price per unit must be greater than zero'),
  supplierName: z.string().optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format'),
});

export type CreateInvestmentBody = z.infer<typeof CreateInvestmentBodySchema>;

export const createInvestmentJsonSchema = {
  description: 'Log a new material purchase/investment',
  tags: ['Investments'],
  security: [{ cookieAuth: [] }],
  body: {
    type: 'object',
    required: ['category', 'materialName', 'quantity', 'unit', 'pricePerUnit', 'purchaseDate'],
    properties: {
      category: { type: 'string' },
      description: { type: 'string' },
      materialName: { type: 'string' },
      quantity: { type: 'number', exclusiveMinimum: 0 },
      unit: { type: 'string' },
      pricePerUnit: { type: 'number', exclusiveMinimum: 0, description: 'Amount in rupees' },
      supplierName: { type: 'string' },
      purchaseDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    },
  },
  response: {
    201: {
      description: 'Investment successfully created',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            displayId: { type: 'string' },
          },
        },
      },
    },
    400: {
      description: 'Validation Error',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};

// ── GET /api/investments ──

export const GetInvestmentsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
  category: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(20),
});

export type GetInvestmentsQuery = z.infer<typeof GetInvestmentsQuerySchema>;

export const getInvestmentsJsonSchema = {
  description: 'Retrieve the investment ledger with date range/category filtering and pagination',
  tags: ['Investments'],
  security: [{ cookieAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      category: { type: 'string' },
      page: { type: ['integer', 'string'], default: 1 },
      limit: { type: ['integer', 'string'], default: 20 },
    },
  },
  response: {
    200: {
      description: 'Investment ledger retrieved successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            entries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  displayId: { type: 'string' },
                  category: { type: 'string' },
                  description: { type: 'string', nullable: true },
                  materialName: { type: 'string' },
                  quantity: { type: 'number' },
                  unit: { type: 'string' },
                  pricePerUnit: { type: 'number' },
                  totalCost: { type: 'number' },
                  supplierName: { type: 'string', nullable: true },
                  purchaseDate: { type: 'string' },
                },
              },
            },
            summary: {
              type: 'object',
              properties: { totalExpense: { type: 'number' } },
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

// ── DELETE /api/investments/:entryId ──

export const deleteInvestmentJsonSchema = {
  description: 'Soft delete an investment entry',
  tags: ['Investments'],
  security: [{ cookieAuth: [] }],
  params: {
    type: 'object',
    required: ['entryId'],
    properties: { entryId: { type: 'string', format: 'uuid' } },
  },
  response: {
    200: {
      description: 'Investment deleted successfully',
      type: 'object',
      properties: { success: { type: 'boolean', default: true } },
    },
    404: {
      description: 'Investment not found or already deleted',
      type: 'object',
      properties: { success: { type: 'boolean', default: false }, error: { type: 'string' } },
    },
  },
};
