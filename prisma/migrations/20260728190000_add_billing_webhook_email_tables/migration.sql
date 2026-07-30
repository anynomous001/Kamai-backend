-- Backfills a migration-history gap: WebhookEvent, BillingHistory, and
-- EmailVerification have existed in schema.prisma (and in every deployed
-- database) for a while, but were never created by any migration file —
-- they were pushed out-of-band at some point (`prisma db push`). Because
-- of that, replaying the full migration history against a genuinely
-- empty database fails: migration 20260729000000_baker_ops_v2_redesign
-- does `ALTER TABLE "BillingHistory" DROP CONSTRAINT
-- "BillingHistory_bakerId_fkey"`, which requires the table (and that
-- constraint) to already exist. This migration creates all three tables
-- at the point in history where they actually first existed (before the
-- redesign), so `migrate deploy` can run cleanly end-to-end on a fresh
-- database.

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "BillingHistory" (
    "id" TEXT NOT NULL,
    "bakerId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "paymentId" TEXT,
    "eventType" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookProcessingStatus" NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "errorMessage" TEXT,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingHistory_bakerId_idx" ON "BillingHistory"("bakerId");

-- CreateIndex
CREATE INDEX "BillingHistory_subscriptionId_idx" ON "BillingHistory"("subscriptionId");

-- CreateIndex
CREATE INDEX "BillingHistory_processedAt_idx" ON "BillingHistory"("processedAt");

-- CreateIndex
CREATE INDEX "EmailVerification_email_createdAt_idx" ON "EmailVerification"("email", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerification_email_expiresAt_idx" ON "EmailVerification"("email", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_eventId_key" ON "WebhookEvent"("eventId");

-- AddForeignKey
-- References the pre-redesign "Baker" table — this constraint is dropped
-- and re-pointed at the new "bakers" table by the redesign migration that
-- follows this one.
ALTER TABLE "BillingHistory" ADD CONSTRAINT "BillingHistory_bakerId_fkey" FOREIGN KEY ("bakerId") REFERENCES "Baker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
