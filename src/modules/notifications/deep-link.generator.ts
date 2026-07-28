export class DeepLinkGenerator {
  static normalizePhoneNumber(phone: string): string {
    let normalized = phone.replace(/[\s\-\+]/g, '');
    
    // If it doesn't already start with country code, we prefix 91 assuming India for now
    // A robust app might need a country code picker, but we follow rules provided.
    // Assuming Indian numbers are 10 digits without country code:
    if (normalized.length === 10) {
      normalized = `91${normalized}`;
    }

    return normalized;
  }

  static generateWhatsAppUrl(phone: string, text: string): string {
    const normalizedPhone = this.normalizePhoneNumber(phone);
    const encodedText = encodeURIComponent(text);
    return `https://wa.me/${normalizedPhone}?text=${encodedText}`;
  }
}
