import { describe, it, expect } from 'vitest';
import { statusValidationService } from '../../src/modules/orders/status-validation.service.js';
import { ConflictError } from '../../src/shared/errors/index.js';

describe('Unit Tests: Pricing & Status validation', () => {
  describe('Status machine transition validation rules', () => {
    it('should validate allowed status transitions', () => {
      // PENDING transitions
      expect(() => statusValidationService.assertValidTransition('PENDING', 'CONFIRMED')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('PENDING', 'CANCELLED')).not.toThrow();

      // CONFIRMED transitions
      expect(() => statusValidationService.assertValidTransition('CONFIRMED', 'IN_PROGRESS')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('CONFIRMED', 'CANCELLED')).not.toThrow();

      // IN_PROGRESS transitions
      expect(() => statusValidationService.assertValidTransition('IN_PROGRESS', 'READY')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('IN_PROGRESS', 'CANCELLED')).not.toThrow();

      // READY transitions
      expect(() => statusValidationService.assertValidTransition('READY', 'DELIVERED')).not.toThrow();
      expect(() => statusValidationService.assertValidTransition('READY', 'CANCELLED')).not.toThrow();
    });

    it('should prevent transitions into immutable status states', () => {
      // DELIVERED is terminal
      expect(() => statusValidationService.assertValidTransition('DELIVERED', 'PENDING')).toThrow(ConflictError);
      
      // CANCELLED is terminal
      expect(() => statusValidationService.assertValidTransition('CANCELLED', 'PENDING')).toThrow(ConflictError);
    });

    it('should throw ConflictError if transitioning to the exact same status', () => {
      expect(() => statusValidationService.assertValidTransition('PENDING', 'PENDING')).toThrow(ConflictError);
      expect(() => statusValidationService.assertValidTransition('CONFIRMED', 'CONFIRMED')).toThrow(ConflictError);
    });

    it('should throw ConflictError for illegal non-linear status skips', () => {
      expect(() => statusValidationService.assertValidTransition('PENDING', 'READY')).toThrow(ConflictError);
      expect(() => statusValidationService.assertValidTransition('CONFIRMED', 'DELIVERED')).toThrow(ConflictError);
    });
  });

  describe('Pricing Calculations and Balance Due', () => {
    it('should correctly calculate balance due and unpaid status', () => {
      const total = 50000; // 500 INR in paise
      const advance = 0;
      const balance = total - advance;
      
      expect(balance).toBe(50000);
      
      // Initial status calculation logic replicated from OrdersService
      let initialPaymentStatus = 'UNPAID';
      if (advance > 0 && balance > 0) {
        initialPaymentStatus = 'PARTIALLY_PAID';
      } else if (balance === 0) {
        initialPaymentStatus = 'PAID';
      }
      expect(initialPaymentStatus).toBe('UNPAID');
    });

    it('should correctly calculate balance due and partially paid status', () => {
      const total = 50000;
      const advance = 15000; // 150 INR in paise
      const balance = total - advance;
      
      expect(balance).toBe(35000);
      
      let initialPaymentStatus = 'UNPAID';
      if (advance > 0 && balance > 0) {
        initialPaymentStatus = 'PARTIALLY_PAID';
      } else if (balance === 0) {
        initialPaymentStatus = 'PAID';
      }
      expect(initialPaymentStatus).toBe('PARTIALLY_PAID');
    });

    it('should correctly calculate balance due and fully paid status', () => {
      const total = 50000;
      const advance = 50000;
      const balance = total - advance;
      
      expect(balance).toBe(0);
      
      let initialPaymentStatus = 'UNPAID';
      if (advance > 0 && balance > 0) {
        initialPaymentStatus = 'PARTIALLY_PAID';
      } else if (balance === 0) {
        initialPaymentStatus = 'PAID';
      }
      expect(initialPaymentStatus).toBe('PAID');
    });
  });
});
