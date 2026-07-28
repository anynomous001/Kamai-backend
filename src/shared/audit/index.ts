/**
 * Audit Service Interface
 * Defines the contract for logging system audit events.
 */
export interface AuditService {
  logEvent(action: string, entityId: string, metadata?: Record<string, unknown>): Promise<void>;
}

/**
 * NoOp Audit Service
 *
 * A stub implementation. Will be replaced by a real Audit Service
 * module in a future action.
 */
export class NoOpAuditService implements AuditService {
  async logEvent(_action: string, _entityId: string, _metadata?: Record<string, unknown>): Promise<void> {
    // Stub: Do nothing.
    return Promise.resolve();
  }
}

// Singleton instance to be used across the application
export const auditService: AuditService = new NoOpAuditService();
