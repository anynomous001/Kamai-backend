import { describe, it, expect } from 'vitest';
import { MessageFormatter } from '../../src/modules/notifications/message.formatter.js';
import { WhatsAppTemplateEngine } from '../../src/modules/notifications/whatsapp-template.engine.js';
import { WhatsAppNotificationTemplate } from '../../src/modules/notifications/notifications.schemas.js';
import { BakerProfileMapper } from '../../src/modules/baker/baker-profile.mapper.js';
import type { Baker } from '@prisma/client';

describe('Unit Tests: Helpers and Mappers', () => {
  describe('MessageFormatter Utility Class', () => {
    it('should format currency values in Indian Rupees correctly', () => {
      expect(MessageFormatter.formatPrice(500)).toBe('₹500');
      expect(MessageFormatter.formatPrice(0)).toBe('₹0');
      expect(MessageFormatter.formatPrice(125.5)).toBe('₹125.5');
    });

    it('should format dates to Indian locale format', () => {
      const testDate = new Date('2026-07-26T12:00:00Z');
      // Format uses local timezone, we'll verify it returns a valid date string matching locale settings
      const formatted = MessageFormatter.formatDate(testDate);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('July');
    });

    it('should compile an order summary message block correctly', () => {
      const orderData = {
        orderNumber: 'ORD-001',
        items: [{ name: 'Chocolate Truffle Cake 1kg', quantity: 1 }],
        deliveryDate: new Date('2026-07-26T12:00:00Z'),
        deliveryType: 'pickup' as const,
        totalPrice: 500,
        advancePaid: 150,
        balanceDue: 350,
        customerName: 'Aria Dev',
        bakerBusinessName: 'Aria Cakes',
        upiId: 'baker@upi',
      };

      const summary = MessageFormatter.buildOrderSummary(orderData);
      expect(summary).toContain('🎂 1x Chocolate Truffle Cake 1kg');
      expect(summary).toContain('Delivery:');
      expect(summary).toContain('Total: ₹500');
      expect(summary).toContain('Advance Paid: ₹150');
      expect(summary).toContain('Balance Due: ₹350');
    });

    it('should return a valid payment prompt if UPI ID exists', () => {
      expect(MessageFormatter.buildPaymentSection('baker@upi')).toBe('UPI:\nbaker@upi');
      expect(MessageFormatter.buildPaymentSection(null)).toBe('');
    });
  });

  describe('WhatsAppTemplateEngine', () => {
    const baseOrderData = {
      orderNumber: 'ORD-001',
      items: [{ name: 'Vanilla cake 0.5kg', quantity: 2 }],
      deliveryDate: new Date('2026-07-26T12:00:00Z'),
      deliveryType: 'pickup' as const,
      totalPrice: 400,
      advancePaid: 200,
      balanceDue: 200,
      customerName: 'Rahul',
      bakerBusinessName: 'Rahul Bakery',
      upiId: 'rahul@okaxis',
    };

    it('should format ORDER_CONFIRMATION message correctly', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.ORDER_CONFIRMATION,
        baseOrderData
      );
      expect(msg).toContain('Hello Rahul 👋');
      expect(msg).toContain('Your order #ORD-001 is confirmed!');
      expect(msg).toContain('Please note the balance due of ₹200');
      expect(msg).toContain('rahul@okaxis');
    });

    it('should format PAYMENT_REMINDER message correctly', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.PAYMENT_REMINDER,
        baseOrderData
      );
      expect(msg).toContain('This is a reminder for your order #ORD-001');
      expect(msg).toContain('Kindly complete the remaining payment before pickup');
    });

    it('should format PAYMENT_REMINDER message with delivery-aware wording', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.PAYMENT_REMINDER,
        { ...baseOrderData, deliveryType: 'delivery' as const }
      );
      expect(msg).toContain('Kindly complete the remaining payment before delivery');
    });

    it('should format READY_FOR_PICKUP message correctly', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.READY_FOR_PICKUP,
        baseOrderData
      );
      expect(msg).toContain('Your order #ORD-001 is ready for pickup!');
      expect(msg).toContain('Please clear your balance of ₹200');
    });

    it('should format READY_FOR_PICKUP message with delivery-aware wording', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.READY_FOR_PICKUP,
        { ...baseOrderData, deliveryType: 'delivery' as const }
      );
      expect(msg).toContain('ready and out for delivery');
      expect(msg).toContain('Please clear your balance of ₹200 at delivery');
    });

    it('should format RECEIPT message correctly', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.RECEIPT,
        { ...baseOrderData, balanceDue: 0 }
      );
      expect(msg).toContain('Here is the receipt for your order #ORD-001');
      expect(msg).toContain('Your order is fully paid. Thank you!');
    });

    it('should format THANK_YOU message correctly', () => {
      const msg = WhatsAppTemplateEngine.generateMessage(
        WhatsAppNotificationTemplate.THANK_YOU,
        baseOrderData
      );
      expect(msg).toContain('We hope you enjoyed your order #ORD-001!');
      expect(msg).toContain('We would love to bake for you again soon');
    });
  });

  describe('BakerProfileMapper', () => {
    it('should map a Baker DB model to a structured profile response', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      const mockBaker = {
        id: 'baker-uuid',
        businessName: 'Delight Cakes',
        ownerName: 'Alice',
        phoneNumber: '+919999999999',
        email: 'alice@delight.com',
        fssaiNumber: '12345678901234',
        fssaiVerified: true,
        isVerified: false,
        upiVpa: 'alice@upi',
        merchantName: 'Alice Merchant',
        defaultCollectionMethod: 'UPI',
        qrCodeEnabled: true,
        subscriptionPlan: 'EARLY_ADOPTER',
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: futureDate,
        nextBillingDate: futureDate,
      } as unknown as Baker;

      const profile = BakerProfileMapper.toProfileResponse(
        mockBaker,
        'https://logo.url',
        'https://fssai.url'
      );

      expect(profile.business.businessName).toBe('Delight Cakes');
      expect(profile.business.phone).toBe('+919999999999');
      expect(profile.business.logoUrl).toBe('https://logo.url');
      expect(profile.business.accountVerified).toBe(false);
      expect(profile.verification.fssaiNumber).toBe('12345678901234');
      expect(profile.verification.fssaiVerified).toBe(true);
      expect(profile.payment.upiId).toBe('alice@upi');
      expect(profile.subscription.plan).toBe('EARLY_ADOPTER');
      expect(profile.subscription.status).toBe('ACTIVE');
      expect(profile.subscription.trialDaysRemaining).toBeGreaterThan(0);
    });
  });
});
