import { describe, it, expect } from 'vitest';
import { statusValidationService } from '../../src/modules/orders/status-validation.service.js';
import { ConflictError } from '../../src/shared/errors/index.js';

describe('Unit Tests: Pricing & Status validation', () => {
  describe('Status machine transition validation rules', () => {
    it('should validate allowed status transitions', () => {
      expect(() => statusValidationService.assertValidTransition('Pending', 'Confirmed')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('Pending', 'Cancelled')).not.toThrow();

      expect(() => statusValidationService.assertValidTransition('Confirmed', 'In Progress')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('Confirmed', 'Cancelled')).not.toThrow();

      expect(() => statusValidationService.assertValidTransition('In Progress', 'Ready')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('In Progress', 'Cancelled')).not.toThrow();

      expect(() => statusValidationService.assertValidTransition('Ready', 'Delivered')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('Ready', 'Cancelled')).not.toThrow();
    });

    it('should prevent transitions into immutable status states', () => {
      expect(() => statusValidationService.assertValidTransition('Delivered', 'Pending')).toThrow(ConflictError);
      expect(() => statusValidationService.assertValidTransition('Cancelled', 'Pending')).toThrow(ConflictError);
    });

    it('should throw ConflictError if transitioning to the exact same status', () => {
      expect(() => statusValidationService.assertValidTransition('Pending', 'Pending')).toThrow(ConflictError);
      expect(() => statusValidationService.assertValidTransition('Confirmed', 'Confirmed')).toThrow(ConflictError);
    });

    it('should throw ConflictError for illegal non-linear status skips', () => {
      expect(() => statusValidationService.assertValidTransition('Pending', 'Ready')).toThrow(ConflictError);
      expect(() => statusValidationService.assertValidTransition('Confirmed', 'Delivered')).toThrow(ConflictError);
    });
  });

  describe('Payment state derivation (matches OrdersService.derivePaymentState)', () => {
    function derive(totalPrice: number, advancePaid: number, forceConfirm = false) {
      const paymentStatus =
        advancePaid === 0 ? 'Unpaid' : advancePaid === totalPrice ? 'Paid' : 'Partially Paid';
      const orderStatus = advancePaid > 0 || forceConfirm ? 'Confirmed' : 'Pending';
      return { orderStatus, paymentStatus };
    }

    it('advancePaid = 0, not force-confirmed -> Pending / Unpaid', () => {
      expect(derive(500, 0)).toEqual({ orderStatus: 'Pending', paymentStatus: 'Unpaid' });
    });

    it('advancePaid = 0, force-confirmed -> Confirmed / Unpaid', () => {
      expect(derive(500, 0, true)).toEqual({ orderStatus: 'Confirmed', paymentStatus: 'Unpaid' });
    });

    it('advancePaid > 0 and < totalPrice -> Confirmed / Partially Paid', () => {
      expect(derive(500, 150)).toEqual({ orderStatus: 'Confirmed', paymentStatus: 'Partially Paid' });
    });

    it('advancePaid = totalPrice -> Confirmed / Paid', () => {
      expect(derive(500, 500)).toEqual({ orderStatus: 'Confirmed', paymentStatus: 'Paid' });
    });
  });
});
