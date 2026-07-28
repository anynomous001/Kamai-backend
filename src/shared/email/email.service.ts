import { Resend } from 'resend';

export class EmailService {
  private resend: Resend | null = null;
  private fromEmail: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'Kamai Verification <onboarding@resend.dev>';
    
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  /**
   * Sends an OTP verification email to the user.
   */
  async sendVerificationEmail(to: string, otp: string, expiresInMinutes: number = 5): Promise<void> {
    if (process.env.NODE_ENV === 'test' || !this.resend) {
      // In development / testing without RESEND_API_KEY, log to console
      console.log(`[EmailService Mock] Verification code ${otp} sent to ${to}`);
      return;
    }

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
        <h2 style="color: #6366f1;">Kamai Verification Code</h2>
        <p>Hello,</p>
        <p>Your Kamai verification code is:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 4px; text-align: center; margin: 20px 0; color: #1f2937;">
          ${otp}
        </div>
        <p>This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          If you did not request this verification code, please ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">— Team Kamai</p>
      </div>
    `;

    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: 'Kamai Verification Code',
      html: htmlContent,
    });

    if (error) {
      console.error('[EmailService] Failed to send email via Resend:', error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }
}

export const emailService = new EmailService();
