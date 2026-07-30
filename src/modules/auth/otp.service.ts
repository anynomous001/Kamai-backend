import { createHash, randomInt, timingSafeEqual } from 'crypto';

import { emailService } from '../../shared/email/email.service.js';
import { auditService } from '../../shared/audit/index.js';
import { TooManyRequestsError, GoneError, UnauthorizedError } from '../../shared/errors/index.js';

import { VerificationRepository } from './verification.repository.js';

export interface SendOtpResult {
  success: boolean;
  message: string;
  expiresIn: number;
}

export class OtpService {
  /**
   * Normalizes email address to lowercase and trimmed string.
   */
  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * Generates a cryptographically secure 6-digit numeric OTP.
   */
  static generateOtp(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Hashes the raw OTP string using SHA-256.
   */
  static hashOtp(otp: string): string {
    return createHash('sha256').update(otp).digest('hex');
  }

  /**
   * Verifies an OTP against a stored hash using a constant-time comparison.
   *
   * A plain `===` string comparison short-circuits on the first differing
   * byte, which leaks timing information an attacker could use to guess
   * the correct OTP one character at a time. `crypto.timingSafeEqual`
   * compares the full buffers in constant time, closing that side channel.
   */
  static verifyOtpHash(otp: string, hash: string): boolean {
    const computedHash = this.hashOtp(otp);
    const computedBuffer = Buffer.from(computedHash, 'hex');
    const storedBuffer = Buffer.from(hash, 'hex');

    // Buffers of unequal length are never valid SHA-256 digests here, and
    // timingSafeEqual throws on length mismatch — guard defensively.
    if (computedBuffer.length !== storedBuffer.length) {
      return false;
    }

    return timingSafeEqual(computedBuffer, storedBuffer);
  }

  /**
   * Requests a new email OTP:
   * - Normalizes email
   * - Enforces 5 requests/hr rate limit
   * - Enforces 60-second cooldown
   * - Hashes and stores OTP in DB
   * - Sends email via shared Resend Email Service
   */
  static async requestOtp(
    emailInput: string,
    options?: { ipAddress?: string; userAgent?: string },
  ): Promise<SendOtpResult> {
    const email = this.normalizeEmail(emailInput);
    const now = new Date();

    // 1. Rate Limit: Max 5 OTP requests per 1 hour
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const hourlyCount = await VerificationRepository.countHourlyRequests(email, oneHourAgo);

    if (hourlyCount >= 5) {
      throw new TooManyRequestsError('Too many verification code requests. Please try again in an hour.');
    }

    // 2. Cooldown Rate Limit: Ensure 60 seconds between requests
    const sixtySecondsAgo = new Date(now.getTime() - 60 * 1000);
    const recentRequest = await VerificationRepository.findRecentRequest(email, sixtySecondsAgo);

    if (recentRequest) {
      throw new TooManyRequestsError('Please wait 60 seconds before requesting another verification code.');
    }

    // 3. Generate & Hash OTP
    const otp = this.generateOtp();
    const otpHash = this.hashOtp(otp);
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes TTL

    // 4. Save EmailVerification record
    const record = await VerificationRepository.createVerification({
      email,
      otpHash,
      expiresAt,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    // 5. Send Verification Email via Resend
    await emailService.sendVerificationEmail(email, otp, 5);

    // 6. Audit Log — capture ip/user-agent context for later abuse investigation
    await auditService.logEvent('EMAIL_OTP_SENT', record.id, {
      email,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
    });

    return {
      success: true,
      message: 'Verification code sent successfully.',
      expiresIn: 300,
    };
  }

  /**
   * Verifies an OTP submitted for an email address.
   */
  static async verifyOtp(
    emailInput: string,
    otp: string,
  ): Promise<{ email: string }> {
    const email = this.normalizeEmail(emailInput);
    const now = new Date();

    // 1. Fetch latest unconsumed verification record
    const record = await VerificationRepository.findLatestUnverified(email);

    if (!record || record.expiresAt < now) {
      await auditService.logEvent('EMAIL_OTP_VERIFICATION_EXPIRED', email, { email });
      throw new GoneError('Verification code expired or not found.', 'OTP_EXPIRED');
    }

    // 2. Check maximum attempts (max 5)
    if (record.attempts >= 5) {
      await auditService.logEvent('EMAIL_OTP_MAX_ATTEMPTS_EXCEEDED', record.id, { email });
      throw new TooManyRequestsError('Maximum verification attempts reached. Please request a new code.', {
        errorCode: 'OTP_MAX_ATTEMPTS_EXCEEDED',
      });
    }

    // 3. Verify OTP Hash
    const isValid = this.verifyOtpHash(otp, record.otpHash);

    if (!isValid) {
      await VerificationRepository.incrementAttempts(record.id);

      await auditService.logEvent('EMAIL_OTP_VERIFICATION_FAILED', record.id, {
        email,
        attempt: record.attempts + 1,
      });

      throw new UnauthorizedError('Incorrect verification code.', 'INVALID_CREDENTIALS');
    }

    // 4. Mark OTP consumed
    await VerificationRepository.markConsumed(record.id, now);

    return { email };
  }
}
