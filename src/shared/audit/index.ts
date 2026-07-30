import type { Prisma } from '@prisma/client';

import { prisma } from '../database/prisma.js';
import { logger } from '../logger/index.js';

/**
 * Audit Service Interface
 * Defines the contract for logging system audit events.
 */
export interface AuditService {
  logEvent(action: string, entityId: string, metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * Prisma-backed Audit Service
 *
 * Persists every security/activity event (OTP sent, OTP verification
 * outcomes, session refresh, refresh-token reuse detection, logout, etc.)
 * to the `AuditLog` table so it can actually be investigated later.
 *
 * Architecture decision: audit logging is a side-effect of the primary
 * auth flow, never a precondition for it. If the audit write itself
 * fails (e.g. DB hiccup), we log the failure locally and resolve
 * successfully rather than throwing — a dropped audit row must never
 * block a legitimate login, OTP send, or token refresh. Call sites in
 * `otp.service.ts` / `auth.service.ts` intentionally do not wrap
 * `logEvent` calls in try/catch; that safety therefore lives here.
 */
export class PrismaAuditService implements AuditService {
  async logEvent(
    action: string,
    entityId: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action,
          entityId,
          // Prisma's `Json?` column requires its own InputJsonValue type
          // rather than a bare Record<string, unknown>. Every call site in
          // this codebase only ever passes plain, JSON-serializable literal
          // objects (email, ip, sessionId, etc.), so this cast is safe;
          // omit the key entirely when no metadata was supplied.
          ...(metadata !== undefined
            ? { metadata: metadata as Prisma.InputJsonValue }
            : {}),
        },
      });
    } catch (error) {
      logger.error(
        { err: error, action, entityId },
        '[AuditService] Failed to persist audit log entry',
      );
    }
  }
}

/**
 * NoOp Audit Service
 *
 * Retained for isolated unit tests that want zero DB interaction.
 * The application itself now always wires up `PrismaAuditService`.
 */
export class NoOpAuditService implements AuditService {
  async logEvent(_action: string, _entityId: string, _metadata?: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
  }
}

// Singleton instance used across the application
export const auditService: AuditService = new PrismaAuditService();
