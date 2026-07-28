import { env } from '../../config/env.js';
import { prisma } from '../../shared/database/prisma.js';
import { auditService } from '../../shared/audit/index.js';
import { NotFoundError, ServiceUnavailableError } from '../../shared/errors/index.js';
import { DeepLinkGenerator } from '../notifications/deep-link.generator.js';
import type { SupportIssueType } from './support.schemas.js';
import { SupportMessageFormatter } from './support-message.formatter.js';

export async function createSupportChatLink(
  bakerId: string,
  issueType: SupportIssueType,
  userMessage: string,
) {
  const supportNumber = env.SUPPORT_WHATSAPP_NUMBER;
  if (!supportNumber || supportNumber.trim() === '') {
    throw new ServiceUnavailableError(
      'Support service is not configured.',
      'SUPPORT_NOT_CONFIGURED',
    );
  }

  const baker = await prisma.baker.findUnique({
    where: { id: bakerId },
    select: {
      businessName: true,
      ownerName: true,
      subscriptionStatus: true,
    },
  });

  if (!baker) {
    throw new NotFoundError('Baker profile not found');
  }

  const formattedMessage = SupportMessageFormatter.formatMessage(
    baker,
    issueType,
    userMessage,
  );

  const whatsappUrl = DeepLinkGenerator.generateWhatsAppUrl(
    supportNumber,
    formattedMessage,
  );

  const now = new Date();
  await auditService.logEvent('SUPPORT_LINK_GENERATED', bakerId, {
    bakerId,
    issueType,
    subscriptionStatus: baker.subscriptionStatus,
    generatedAt: now.toISOString(),
  });

  return {
    issueType,
    whatsappUrl,
    generatedAt: now.toISOString(),
  };
}
