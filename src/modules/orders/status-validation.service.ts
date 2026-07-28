import { ConflictError } from '../../shared/errors/index.js';
import type { OrderStatus } from '@prisma/client';

export class StatusValidationService {
  /**
   * Asserts if an order status transition is valid according to business rules.
   * Throws ConflictError (INVALID_ORDER_STATUS_TRANSITION) if invalid.
   */
  assertValidTransition(currentStatus: OrderStatus, newStatus: OrderStatus): void {
    if (currentStatus === newStatus) {
      throw new ConflictError(
        'Order is already in the requested status.',
        'INVALID_ORDER_STATUS_TRANSITION',
      );
    }

    // DELIVERED and CANCELLED states are terminal and immutable.
    if (currentStatus === 'DELIVERED' || currentStatus === 'CANCELLED') {
      throw new ConflictError(
        `Cannot change status from immutable state: ${currentStatus}.`,
        'INVALID_ORDER_STATUS_TRANSITION',
      );
    }

    // Validation rules dictionary mapped to valid next statuses.
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      PENDING: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['IN_PROGRESS', 'CANCELLED'],
      IN_PROGRESS: ['READY', 'CANCELLED'],
      READY: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [], // Immutable
      CANCELLED: [], // Immutable
    };

    const allowedStatuses = validTransitions[currentStatus];

    if (!allowedStatuses.includes(newStatus)) {
      throw new ConflictError(
        `Invalid order status transition from ${currentStatus} to ${newStatus}.`,
        'INVALID_ORDER_STATUS_TRANSITION',
      );
    }
  }
}

export const statusValidationService = new StatusValidationService();
