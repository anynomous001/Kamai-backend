import { ConflictError } from '../../shared/errors/index.js';

export type OrderStatusValue = 'Pending' | 'Confirmed' | 'In Progress' | 'Ready' | 'Delivered' | 'Cancelled';

export class StatusValidationService {
  /**
   * Asserts if an order status transition is valid according to business rules.
   * Throws ConflictError (INVALID_ORDER_STATUS_TRANSITION) if invalid.
   */
  assertValidTransition(currentStatus: OrderStatusValue, newStatus: OrderStatusValue): void {
    if (currentStatus === newStatus) {
      throw new ConflictError(
        'Order is already in the requested status.',
        'INVALID_ORDER_STATUS_TRANSITION',
      );
    }

    // Delivered and Cancelled states are terminal and immutable.
    if (currentStatus === 'Delivered' || currentStatus === 'Cancelled') {
      throw new ConflictError(
        `Cannot change status from immutable state: ${currentStatus}.`,
        'INVALID_ORDER_STATUS_TRANSITION',
      );
    }

    const validTransitions: Record<OrderStatusValue, OrderStatusValue[]> = {
      Pending: ['Confirmed', 'Cancelled'],
      Confirmed: ['In Progress', 'Cancelled'],
      'In Progress': ['Ready', 'Cancelled'],
      Ready: ['Delivered', 'Cancelled'],
      Delivered: [], // Immutable
      Cancelled: [], // Immutable
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
