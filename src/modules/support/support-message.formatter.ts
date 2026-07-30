import fs from 'node:fs';
import path from 'node:path';

import type { SupportIssueType } from './support.schemas.js';

interface BakerSupportDetails {
  businessName: string | null;
  ownerName: string | null;
  subscriptionStatus: string;
}

let cachedAppVersion: string | null = null;

function getAppVersion(): string {
  if (cachedAppVersion) {
    return cachedAppVersion;
  }

  try {
    const pkgPath = path.join(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgContent);
      if (pkg && typeof pkg.version === 'string') {
        cachedAppVersion = pkg.version;
        return pkg.version;
      }
    }
  } catch {
    // Ignore read/parse errors and fallback
  }

  cachedAppVersion = 'Unknown';
  return 'Unknown';
}

export class SupportMessageFormatter {
  static formatMessage(
    baker: BakerSupportDetails,
    issueType: SupportIssueType,
    userMessage: string,
  ): string {
    const appVersion = getAppVersion();
    const businessName = baker.businessName || 'Not Set';
    const ownerName = baker.ownerName || 'Not Set';

    return [
      'Hello Kamai Support 👋',
      '',
      'Business Name:',
      businessName,
      '',
      'Owner:',
      ownerName,
      '',
      'Issue Type:',
      issueType,
      '',
      'Subscription:',
      baker.subscriptionStatus,
      '',
      'Message:',
      userMessage,
      '',
      'App Version:',
      appVersion,
      '',
      'Thank you.',
    ].join('\n');
  }
}
