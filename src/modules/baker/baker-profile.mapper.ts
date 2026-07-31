import type { Baker } from '@prisma/client';

export class BakerProfileMapper {
  static toProfileResponse(baker: Baker, logoUrl: string | null, fssaiDocumentUrl: string | null) {
    const now = new Date();
    let trialDaysRemaining = 0;

    if (baker.trialEndsAt) {
      const diffTime = baker.trialEndsAt.getTime() - now.getTime();
      trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return {
      business: {
        businessName: baker.businessName,
        ownerName: baker.ownerName,
        phone: baker.phoneNumber,
        email: baker.email,
        logoUrl,
        // Generic tenant verification flag — distinct from fssaiVerified below.
        accountVerified: baker.isVerified,
      },
      menu: {
        menuSlug: baker.menuSlug,
        menuSlugEditable: baker.menuSlugEditedAt === null,
        whatsappNumber: baker.whatsappNumber,
      },
      verification: {
        fssaiNumber: baker.fssaiNumber,
        fssaiVerified: baker.fssaiVerified,
        fssaiDocumentUrl,
      },
      payment: {
        upiId: baker.upiVpa,
        merchantName: baker.merchantName,
        defaultCollectionMethod: baker.defaultCollectionMethod,
        dynamicQrEnabled: baker.qrCodeEnabled,
        // Soft default only — does not gate whether a RECEIPT message can
        // be sent, see notifications.service.ts. Surfaced here so the
        // frontend has a client-visible signal for its suggested/
        // pre-filled-by-default UI treatment.
        whatsappReceiptEnabled: baker.whatsappReceiptEnabled,
        // Also a suggested default only — the New Order form uses this to
        // pre-fill its advance-received field, not to enforce a minimum.
        defaultAdvancePercentage:
          baker.defaultAdvancePercentage !== null && baker.defaultAdvancePercentage !== undefined
            ? Number(baker.defaultAdvancePercentage)
            : null,
      },
      subscription: {
        plan: baker.subscriptionPlan,
        status: baker.subscriptionStatus,
        trialEndsOn: baker.trialEndsAt ? baker.trialEndsAt.toISOString() : null,
        trialDaysRemaining,
        nextBillingDate: baker.nextBillingDate ? baker.nextBillingDate.toISOString() : null,
      },
    };
  }
}
