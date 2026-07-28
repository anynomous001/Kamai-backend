import type { Baker } from '@prisma/client';

export class BakerProfileMapper {
  static toProfileResponse(baker: Baker, logoUrl: string | null, fssaiDocumentUrl: string | null) {
    const now = new Date();
    let trialDaysRemaining = 0;
    
    if (baker.trialEndDate) {
      const diffTime = baker.trialEndDate.getTime() - now.getTime();
      trialDaysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    return {
      business: {
        businessName: baker.businessName,
        ownerName: baker.ownerName,
        phone: baker.phoneNumber,
        email: baker.email,
        logoUrl,
      },
      verification: {
        fssaiNumber: baker.fssaiNumber,
        fssaiVerified: baker.isVerified,
        fssaiDocumentUrl,
      },
      payment: {
        upiId: baker.upiId,
        merchantName: baker.merchantName,
        defaultCollectionMethod: baker.defaultCollectionMethod,
        dynamicQrEnabled: baker.dynamicQrEnabled,
      },
      subscription: {
        plan: baker.subscriptionPlan,
        status: baker.subscriptionStatus,
        trialEndsOn: baker.trialEndDate ? baker.trialEndDate.toISOString() : null,
        trialDaysRemaining,
        nextBillingDate: baker.nextBillingDate ? baker.nextBillingDate.toISOString() : null,
      },
    };
  }
}
