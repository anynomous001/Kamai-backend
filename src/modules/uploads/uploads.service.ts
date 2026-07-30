import { v4 as uuidv4 } from 'uuid';

import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { storageProvider } from '../../shared/storage/supabase.storage.js';
import { BadRequestError, NotFoundError } from '../../shared/errors/index.js';

import { UploadCategory } from './uploads.schemas.js';

const ALLOWED_MIME_TYPES: Record<UploadCategory, string[]> = {
  BUSINESS_LOGO: ['image/png', 'image/jpeg', 'image/webp'],
  FSSAI_DOCUMENT: ['application/pdf', 'image/png', 'image/jpeg'],
};

function getExtensionFromMime(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

function getFolderForCategory(category: UploadCategory): string {
  return category === UploadCategory.BUSINESS_LOGO ? 'logo' : 'fssai';
}

export async function generateUploadUrl(bakerId: string, contentType: string, category: UploadCategory) {
  // 1. Validate MIME type against category
  const allowedTypes = ALLOWED_MIME_TYPES[category];
  if (!allowedTypes?.includes(contentType)) {
    throw new BadRequestError(`Invalid content type '${contentType}' for category '${category}'`);
  }

  // 2. Generate unique path
  const uuid = uuidv4();
  const ext = getExtensionFromMime(contentType);
  const folder = getFolderForCategory(category);
  const path = `${bakerId}/${folder}/${uuid}.${ext}`;

  // 3. Request signed URL from storage provider
  const expiresIn = 300; // 5 minutes
  const result = await storageProvider.generateSignedUploadUrl(path, contentType, expiresIn);

  return result;
}

export async function confirmUpload(bakerId: string, filePath: string, category: UploadCategory) {
  // 1. Verify object exists in storage
  const exists = await storageProvider.verifyObjectExists(filePath);
  if (!exists) {
    throw new BadRequestError('Upload confirmation failed: File not found in storage');
  }

  // 2. Process transaction: Update baker profile and log audit
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // tx.baker.update() throws (P2025) rather than returning null when the
    // record is missing, so existence must be checked beforehand to surface
    // a NotFoundError instead of an unhandled Prisma error.
    const existingBaker = await tx.baker.findUnique({
      where: { id: bakerId },
      select: { id: true },
    });

    if (!existingBaker) {
      throw new NotFoundError('Baker not found');
    }

    const dataToUpdate: { logoPath?: string; fssaiDocumentPath?: string } = {};
    if (category === UploadCategory.BUSINESS_LOGO) {
      dataToUpdate.logoPath = filePath;
    } else if (category === UploadCategory.FSSAI_DOCUMENT) {
      dataToUpdate.fssaiDocumentPath = filePath;
    }

    await tx.baker.update({
      where: { id: bakerId },
      data: dataToUpdate,
    });

    // Audit log
    const eventType =
      category === UploadCategory.BUSINESS_LOGO ? 'BUSINESS_LOGO_UPLOADED' : 'FSSAI_DOCUMENT_UPLOADED';

    await auditService.logEvent(eventType, bakerId, {
      uploadCategory: category,
      filePath: filePath,
      uploadedAt: now.toISOString(),
    });
  });

  return {
    category,
    filePath,
    uploadedAt: now.toISOString(),
  };
}
