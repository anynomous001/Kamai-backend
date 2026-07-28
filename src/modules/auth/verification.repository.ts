import { prisma } from '../../shared/database/prisma.js';
import type { EmailVerification } from '@prisma/client';

export class VerificationRepository {
  /**
   * Counts verification requests created for a normalized email within a specific time window.
   */
  static async countHourlyRequests(email: string, since: Date): Promise<number> {
    return prisma.emailVerification.count({
      where: {
        email,
        createdAt: { gte: since },
      },
    });
  }

  /**
   * Finds the most recent verification request for an email since a specific timestamp.
   */
  static async findRecentRequest(email: string, since: Date): Promise<EmailVerification | null> {
    return prisma.emailVerification.findFirst({
      where: {
        email,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Creates a new EmailVerification record.
   */
  static async createVerification(data: {
    email: string;
    otpHash: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<EmailVerification> {
    const now = new Date();
    return prisma.emailVerification.create({
      data: {
        email: data.email,
        otpHash: data.otpHash,
        expiresAt: data.expiresAt,
        attempts: 0,
        lastSentAt: now,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
    });
  }

  /**
   * Finds the latest unconsumed verification record for a normalized email.
   */
  static async findLatestUnverified(email: string): Promise<EmailVerification | null> {
    return prisma.emailVerification.findFirst({
      where: {
        email,
        verifiedAt: null,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Increments attempt count for a verification record.
   */
  static async incrementAttempts(id: string): Promise<EmailVerification> {
    return prisma.emailVerification.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
      },
    });
  }

  /**
   * Marks a verification record as verified and consumed.
   */
  static async markConsumed(id: string, timestamp: Date = new Date()): Promise<EmailVerification> {
    return prisma.emailVerification.update({
      where: { id },
      data: {
        verifiedAt: timestamp,
        consumedAt: timestamp,
      },
    });
  }
}
