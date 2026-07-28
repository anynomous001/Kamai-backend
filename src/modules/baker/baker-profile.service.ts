import { prisma } from '../../shared/database/prisma.js';
import { NotFoundError } from '../../shared/errors/index.js';
import { storageProvider } from '../../shared/storage/supabase.storage.js';
import { BakerProfileMapper } from './baker-profile.mapper.js';

export async function getBakerProfile(bakerId: string) {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: {
      id: true,
      businessName: true,
      ownerName: true,
      phoneNumber: true,
      email: true,
      logoPath: true,
      fssaiNumber: true,
      isVerified: true,
      fssaiDocumentPath: true,
      upiId: true,
      merchantName: true,
      defaultCollectionMethod: true,
      dynamicQrEnabled: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndDate: true,
      nextBillingDate: true,
    },
  });

  if (!baker) {
    throw new NotFoundError('Baker profile not found');
  }

  const expiresInSeconds = 3600; // 1 hour

  let logoUrl: string | null = null;
  if (baker.logoPath) {
    logoUrl = await storageProvider.getSignedReadUrl(baker.logoPath, expiresInSeconds);
  }

  let fssaiDocumentUrl: string | null = null;
  if (baker.fssaiDocumentPath) {
    fssaiDocumentUrl = await storageProvider.getSignedReadUrl(baker.fssaiDocumentPath, expiresInSeconds);
  }

  // NOTE: the 'select' limits fields, so we need to cast it as 'any' or map explicitly if mapper expects 'Baker'.
  // We can just cast it as any to satisfy the mapper's full Baker model constraint.
  return BakerProfileMapper.toProfileResponse(baker as any, logoUrl, fssaiDocumentUrl);
}
