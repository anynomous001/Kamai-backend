import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { NotFoundError } from '../../shared/errors/index.js';
import type { UpdateUpiSettingsBody } from './baker.schemas.js';

export async function updateUpiSettings(bakerId: string, payload: UpdateUpiSettingsBody) {
  // 1. Validate baker exists and fetch default business name
  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: { id: true, businessName: true, upiId: true },
  });

  if (!baker) {
    throw new NotFoundError('Baker not found');
  }

  // 2. Resolve default values
  const finalMerchantName = payload.merchantName || baker.businessName;
  const finalCollectionMethod = payload.defaultCollectionMethod || 'UPI';
  const finalDynamicQr = payload.generateDynamicQR ?? true;
  const finalPreferredApps = payload.preferredApps || [];

  // 3. Update in a transaction with audit log
  const updatedBaker = await prisma.$transaction(async (tx) => {
    const updated = await tx.baker.update({
      where: { id: bakerId },
      data: {
        upiId: payload.upiId,
        merchantName: finalMerchantName,
        preferredApps: finalPreferredApps,
        defaultCollectionMethod: finalCollectionMethod,
        dynamicQrEnabled: finalDynamicQr,
      },
      select: {
        upiId: true,
        merchantName: true,
        preferredApps: true,
        defaultCollectionMethod: true,
        dynamicQrEnabled: true,
        updatedAt: true,
      },
    });

    await auditService.logEvent('UPI_SETTINGS_UPDATED', bakerId, {
      oldUpiId: baker.upiId,
      newUpiId: updated.upiId,
      merchantName: updated.merchantName,
      preferredApps: updated.preferredApps,
      dynamicQrEnabled: updated.dynamicQrEnabled,
      defaultCollectionMethod: updated.defaultCollectionMethod,
    });

    return updated;
  });

  return updatedBaker;
}
