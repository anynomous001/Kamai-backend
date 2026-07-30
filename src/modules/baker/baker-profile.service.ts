import { prisma } from '../../shared/database/prisma.js';
import { NotFoundError } from '../../shared/errors/index.js';
import { storageProvider } from '../../shared/storage/supabase.storage.js';
import { auditService } from '../../shared/audit/index.js';

import { BakerProfileMapper } from './baker-profile.mapper.js';
import type { UpdateBakerProfileBody } from './baker.schemas.js';

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
      fssaiVerified: true,
      fssaiDocumentPath: true,
      upiVpa: true,
      merchantName: true,
      defaultCollectionMethod: true,
      qrCodeEnabled: true,
      whatsappReceiptEnabled: true,
      defaultAdvancePercentage: true,
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
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

export async function updateBakerProfile(bakerId: string, payload: UpdateBakerProfileBody) {
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: { id: true, ownerName: true, phoneNumber: true, defaultAdvancePercentage: true },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  const updatedBaker = await prisma.$transaction(async (tx) => {
    const updated = await tx.baker.update({
      where: { id: bakerId },
      data: {
        ...(payload.ownerName !== undefined ? { ownerName: payload.ownerName } : {}),
        ...(payload.phone !== undefined ? { phoneNumber: payload.phone } : {}),
        ...(payload.defaultAdvancePercentage !== undefined
          ? { defaultAdvancePercentage: payload.defaultAdvancePercentage }
          : {}),
      },
      select: { ownerName: true, phoneNumber: true, defaultAdvancePercentage: true, updatedAt: true },
    });

    await auditService.logEvent('BAKER_PROFILE_UPDATED', bakerId, {
      oldOwnerName: baker.ownerName,
      newOwnerName: updated.ownerName,
      oldPhone: baker.phoneNumber,
      newPhone: updated.phoneNumber,
      oldDefaultAdvancePercentage: baker.defaultAdvancePercentage,
      newDefaultAdvancePercentage: updated.defaultAdvancePercentage,
    });

    return updated;
  });

  return {
    ownerName: updatedBaker.ownerName,
    phone: updatedBaker.phoneNumber,
    defaultAdvancePercentage:
      updatedBaker.defaultAdvancePercentage !== null ? Number(updatedBaker.defaultAdvancePercentage) : null,
    updatedAt: updatedBaker.updatedAt,
  };
}
