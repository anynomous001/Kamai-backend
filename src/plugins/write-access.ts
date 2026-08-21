import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import { prisma } from '../shared/database/prisma.js';
import { PaymentRequiredError, NotFoundError } from '../shared/errors/index.js';

/**
 * Write Access Plugin
 *
 * Exposes a `requireWriteAccess` decorator, used as an ADDITIONAL
 * preHandler (after `app.authenticate`) on every mutation route that a
 * trial-expired, unsubscribed baker must not be able to reach - not even
 * via a direct request bypassing the UI. Reads are never gated here;
 * only routes that opt in by listing this preHandler are blocked.
 *
 * Mirrors the exact same "is this baker read-only" condition the
 * frontend paywall uses (src/app/page.tsx's isPaywalled): status !==
 * ACTIVE AND trialEndsAt has passed. A baker who's ACTIVE, still mid
 * trial, or has no trialEndsAt at all is unaffected.
 *
 * isFounderAccount bypasses this check entirely, regardless of
 * subscriptionStatus or trialEndsAt - it's a DB-only flag (never settable
 * through any API route, see schema.prisma) for founder/internal accounts
 * that must always keep full write access.
 */
export const writeAccessPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorate(
      'requireWriteAccess',
      async (req: FastifyRequest, _reply: FastifyReply) => {
        const bakerId = req.user?.id;
        if (!bakerId) return; // app.authenticate already ran and would have thrown

        const baker = await prisma.baker.findUnique({
          where: { id: bakerId },
          select: { subscriptionStatus: true, trialEndsAt: true, isFounderAccount: true },
        });

        if (!baker) {
          throw new NotFoundError('Baker not found');
        }

        const isReadOnly =
          !baker.isFounderAccount &&
          baker.subscriptionStatus !== 'ACTIVE' &&
          baker.trialEndsAt != null &&
          baker.trialEndsAt.getTime() <= Date.now();

        if (isReadOnly) {
          throw new PaymentRequiredError();
        }
      },
    );
  },
  {
    name: 'writeAccess',
    dependencies: ['authenticate'],
  },
);
