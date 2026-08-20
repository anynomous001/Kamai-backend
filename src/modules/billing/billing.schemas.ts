import { z } from 'zod';

export const GetBillingStatusResponseSchema = z.object({
  plan: z.string().nullable(),
  subscriptionStatus: z.string(),
  trialDaysRemaining: z.number().int(),
  trialEndDate: z.string().nullable(),
  nextBillingDate: z.string().nullable(),
  autoRenew: z.boolean(),
  lockedMonthlyPrice: z.number().nullable(),
  currentOfferPrice: z.number(),
  spotsRemaining: z.number().int(),
});

export const CreateSubscriptionBodySchema = z.object({
  plan: z.enum(['EARLY_ADOPTER']),
});

export type CreateSubscriptionBody = z.infer<typeof CreateSubscriptionBodySchema>;

export const getBillingStatusJsonSchema = {
  description: 'Retrieve current billing status and trial info',
  tags: ['Billing'],
  security: [{ cookieAuth: [] }],
  response: {
    200: {
      description: 'Billing status retrieved successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            plan: { type: 'string', nullable: true },
            subscriptionStatus: { type: 'string' },
            trialDaysRemaining: { type: 'integer' },
            trialEndDate: { type: 'string', nullable: true },
            nextBillingDate: { type: 'string', nullable: true },
            autoRenew: { type: 'boolean' },
            lockedMonthlyPrice: { type: 'number', nullable: true },
            currentOfferPrice: { type: 'number' },
            spotsRemaining: { type: 'integer' },
          },
        },
      },
    },
  },
};

export const createSubscriptionJsonSchema = {
  description: 'Create a Razorpay subscription (mandate) for a specific plan',
  tags: ['Billing'],
  security: [{ cookieAuth: [] }],
  body: {
    type: 'object',
    required: ['plan'],
    properties: {
      plan: { type: 'string', enum: ['EARLY_ADOPTER'] },
    },
  },
  response: {
    200: {
      description: 'Checkout metadata returned successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            subscriptionId: { type: 'string' },
            keyId: { type: 'string' },
            checkoutUrl: { type: 'string', nullable: true },
            plan: { type: 'string', enum: ['EARLY_ADOPTER', 'STANDARD'] },
            monthlyPrice: { type: 'number' },
          },
        },
      },
    },
    409: {
      description: 'Subscription already active or pending',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        // Matches error-handler.ts's actual AppError response shape
        // (message + errorCode, not "error") - a response schema that
        // doesn't declare a field silently strips it via ajv's response
        // serializer. Identical bug to the one fixed on
        // cancelSubscriptionJsonSchema's 409 below (commit e48cce4);
        // this was the twin case flagged then and deferred to here.
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};

export const cancelSubscriptionJsonSchema = {
  description:
    'Cancel the baker\'s Razorpay subscription at the end of the current billing cycle. ' +
    'Only triggers the cancellation at Razorpay - subscriptionStatus is updated later by the ' +
    'subscription.cancelled webhook, not by this endpoint.',
  tags: ['Billing'],
  security: [{ cookieAuth: [] }],
  response: {
    200: {
      description: 'Cancellation requested successfully',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        data: {
          type: 'object',
          properties: {
            subscriptionId: { type: 'string' },
            cancelAtCycleEnd: { type: 'boolean' },
            razorpayStatus: { type: 'string' },
          },
        },
      },
    },
    409: {
      description: 'No active subscription to cancel',
      type: 'object',
      properties: {
        success: { type: 'boolean', default: false },
        // Matches error-handler.ts's actual AppError response shape
        // (message + errorCode, not "error") - a response schema that
        // doesn't declare a field silently strips it via ajv's response
        // serializer, which is what was actually happening here before
        // this matched the real shape (confirmed live: the endpoint
        // returned a bare {"success":false} with the real message and
        // errorCode both dropped).
        message: { type: 'string' },
        errorCode: { type: 'string' },
      },
    },
  },
};
