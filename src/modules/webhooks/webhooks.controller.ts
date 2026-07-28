import type { FastifyRequest, FastifyReply } from 'fastify';
import { razorpayWebhookProcessor } from './razorpay-webhook.processor.js';
import { processWebhookEvent } from './webhooks.service.js';
import { logger } from '../../shared/logger/index.js';

export async function razorpayWebhookHandler(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const signature = req.headers['x-razorpay-signature'] as string;
  const eventId = req.headers['x-razorpay-event-id'] as string;

  if (!signature || !eventId) {
    logger.warn('Webhook received without signature or event ID');
    return reply.code(401).send({
      success: false,
      errorCode: 'INVALID_WEBHOOK_SIGNATURE',
    });
  }

  // fastify-raw-body adds rawBody to the request if configured correctly
  const rawBody = (req as FastifyRequest & { rawBody?: string | Buffer }).rawBody;

  if (rawBody == null) {
    logger.error('Raw body not available for webhook processing');
    return reply.code(500).send({
      success: false,
      errorCode: 'INTERNAL_SERVER_ERROR',
    });
  }

  const payloadString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

  try {
    razorpayWebhookProcessor.verifySignature(payloadString, signature);
  } catch (error) {
    logger.error('Webhook signature verification failed');
    return reply.code(401).send({
      success: false,
      errorCode: 'INVALID_WEBHOOK_SIGNATURE',
    });
  }

  try {
    const event = razorpayWebhookProcessor.parseEvent(payloadString);
    event.eventId = eventId;

    await processWebhookEvent(event);

    return reply.code(200).send({
      success: true,
      message: 'Webhook processed successfully.',
    });
  } catch (error) {
    // If Baker not found or other internal error, we log and return 200 to prevent retries
    // Wait, the user said: "If database error -> ROLLBACK -> 500". "Subscription Not Found -> 404".
    // "On duplicate -> 200 OK". "Always return HTTP 200 after successfully processing (or recognising a duplicate)".
    // Let's check error message to return 404 for not found, 500 for db failure.
    if (error instanceof Error && error.message === 'Baker not found') {
      return reply.code(404).send({ success: false, errorCode: 'SUBSCRIPTION_NOT_FOUND' });
    }

    return reply.code(500).send({ success: false, errorCode: 'INTERNAL_SERVER_ERROR' });
  }
}
