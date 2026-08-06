import satori from 'satori';
import sharp from 'sharp';

import { prisma } from '../../../shared/database/prisma.js';
import { auditService } from '../../../shared/audit/index.js';
import { storageProvider } from '../../../shared/storage/supabase.storage.js';
import { logger } from '../../../shared/logger/index.js';
import { NotFoundError, WhatsAppReceiptDisabledError } from '../../../shared/errors/index.js';
import { MessageFormatter } from '../../notifications/message.formatter.js';

import { loadReceiptCardFonts } from './fonts.js';
import { buildReceiptCardTree, CARD_WIDTH, CARD_HEIGHT, type ReceiptCardData } from './receipt-card.template.js';

const READ_URL_EXPIRES_IN_SECONDS = 3600; // matches the existing menu-item-photo / baker-logo pattern

async function fetchLogoDataUri(logoPath: string | null, bakerId: string): Promise<string | null> {
  if (logoPath == null) return null;

  try {
    const signedUrl = await storageProvider.getSignedReadUrl(logoPath, READ_URL_EXPIRES_IN_SECONDS);
    if (signedUrl == null) return null;

    const response = await fetch(signedUrl);
    if (!response.ok) {
      logger.warn({ bakerId, logoPath, status: response.status }, 'Receipt image: logo fetch returned non-OK status, falling back to monogram');
      return null;
    }

    const contentType = response.headers.get('content-type') ?? 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch (err) {
    // The logo is a nice-to-have on this card, not the reason it exists —
    // a flaky fetch of the baker's own logo must not block the receipt
    // (and the baker's own initial-monogram fallback still looks intentional).
    logger.warn({ bakerId, logoPath, err }, 'Receipt image: failed to fetch logo bytes, falling back to monogram');
    return null;
  }
}

function buildItemMeta(weightInPounds: unknown, quantity: unknown): string {
  const parts: string[] = [];
  if (weightInPounds !== null && weightInPounds !== undefined) {
    parts.push(`${Number(weightInPounds)} lb`);
  }
  if (quantity !== null && quantity !== undefined) {
    const qty = Number(quantity);
    parts.push(qty === 1 ? '1 unit' : `${qty} units`);
  }
  return parts.join(' · ');
}

export async function generateReceiptImage(bakerId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({
    where: { displayId: orderNumber, bakerId },
    include: { customer: true, baker: true },
  });

  if (!order) {
    throw new NotFoundError('Order not found');
  }

  // whatsappReceiptEnabled gates this feature entirely (unlike the
  // wa.me text-message templates, where the flag is only a soft default —
  // see notifications.service.ts). The frontend hides the "Share Receipt"
  // action when this is false; this check exists so the endpoint doesn't
  // silently do it anyway if called directly.
  if (!order.baker.whatsappReceiptEnabled) {
    throw new WhatsAppReceiptDisabledError();
  }

  const [logoDataUri, fonts] = await Promise.all([
    fetchLogoDataUri(order.baker.logoPath, bakerId),
    loadReceiptCardFonts(),
  ]);

  const balanceDue = Number(order.balanceDue);

  const cardData: ReceiptCardData = {
    businessName: order.baker.businessName ?? 'Your Baker',
    logoDataUri,
    orderNumber: order.displayId,
    customerName: order.customer.name,
    itemName: `${order.cakeFlavour} ${order.cakeCategory}`,
    itemMeta: buildItemMeta(order.weightInPounds, order.quantity),
    deliveryLabel: order.deliveryType === 'pickup' ? 'Pickup on' : 'Delivery on',
    deliveryDateText: MessageFormatter.formatDate(order.deliveryDate),
    totalText: MessageFormatter.formatPrice(Number(order.totalPrice)),
    advancePaidText: MessageFormatter.formatPrice(Number(order.advancePaid)),
    balanceDueText: balanceDue > 0 ? MessageFormatter.formatPrice(balanceDue) : null,
  };

  const svg = await satori(buildReceiptCardTree(cardData), {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    fonts,
  });

  const png = await sharp(Buffer.from(svg)).png().toBuffer();

  // Stable, upsert-on-regenerate path — a baker tapping "Share Receipt"
  // twice overwrites the same object instead of leaving the previous
  // render behind unreferenced (see KI-008 for the cost of not doing this).
  const filePath = `receipt-images/${bakerId}/${order.id}.png`;
  await storageProvider.uploadObject(filePath, png, 'image/png');

  const imageUrl = await storageProvider.getSignedReadUrl(filePath, READ_URL_EXPIRES_IN_SECONDS);
  if (imageUrl == null) {
    throw new NotFoundError('Receipt image was generated but could not be signed for reading');
  }

  const now = new Date();
  await auditService.logEvent('RECEIPT_IMAGE_GENERATED', bakerId, {
    orderId: order.id,
    orderNumber: order.displayId,
    generatedAt: now.toISOString(),
  });

  return {
    orderNumber: order.displayId,
    imageUrl,
    expiresIn: READ_URL_EXPIRES_IN_SECONDS,
    generatedAt: now.toISOString(),
  };
}
