import fp from 'fastify-plugin';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

import { AppError } from '../shared/errors/index.js';
import { logger } from '../shared/logger/index.js';
import { env } from '../config/env.js';

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler(
    (error: FastifyError | AppError | Error, req: FastifyRequest, reply: FastifyReply) => {
      // ── Zod Validation Error ───────────────────────────────
      if (error instanceof ZodError) {
        const details = error.errors.reduce<Record<string, string>>(
          (acc, e) => {
            acc[e.path.join('.')] = e.message;
            return acc;
          },
          {},
        );

        return reply.code(422).send({
          success: false,
          message: 'Validation failed',
          errorCode: 'VALIDATION_ERROR',
          details,
        });
      }

      // ── Fastify Validation Error ───────────────────────────
      if ('validation' in error && error.validation) {
        return reply.code(422).send({
          success: false,
          message: 'Request validation failed',
          errorCode: 'VALIDATION_ERROR',
          details: error.validation,
        });
      }

      // ── Known Operational Errors ───────────────────────────
      if (error instanceof AppError) {
        if (error.statusCode >= 500) {
          logger.error(
            { err: error, reqId: req.id, url: req.url },
            'Operational server error',
          );
        }

        return reply.code(error.statusCode).send({
          success: false,
          message: error.message,
          errorCode: error.errorCode,
          ...(error.details ? { details: error.details } : {}),
        });
      }

      // ── Fastify Rate Limit Error ───────────────────────────
      if ('statusCode' in error && error.statusCode === 429) {
        return reply.code(429).send({
          success: false,
          message: 'Too many requests',
          errorCode: 'TOO_MANY_REQUESTS',
        });
      }

      // ── Unknown Errors ────────────────────────────────────
      logger.error(
        { err: error, reqId: req.id, url: req.url, method: req.method },
        'Unhandled error',
      );

      // Never expose stack traces in production
      const isDev = env.NODE_ENV === 'development';

      return reply.code(500).send({
        success: false,
        message: 'An unexpected error occurred',
        errorCode: 'INTERNAL_SERVER_ERROR',
        ...(isDev && error instanceof Error
          ? { details: { stack: error.stack, message: error.message } }
          : {}),
      });
    },
  );

  // ── 404 Handler ────────────────────────────────────────────
  app.setNotFoundHandler((req, reply) => {
    return reply.code(404).send({
      success: false,
      message: `Route ${req.method} ${req.url} not found`,
      errorCode: 'NOT_FOUND',
    });
  });
});
