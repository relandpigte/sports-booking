-- CreateEnum
CREATE TYPE "TrainerStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "TrainerSessionMode" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "TrainerAvailabilityExceptionType" AS ENUM ('AVAILABLE', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "TrainerSessionStatus" AS ENUM ('REQUESTED', 'AWAITING_PAYMENT', 'PAYMENT_REVIEW', 'CONFIRMED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'COMPLETED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "ChatConversationKind" ADD VALUE 'TRAINER_SESSION';

-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "trainerSessionId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "TrainerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TrainerStatus" NOT NULL DEFAULT 'DRAFT',
    "bio" TEXT,
    "sports" TEXT[],
    "specialties" TEXT[],
    "experience" TEXT,
    "certifications" TEXT,
    "sessionMode" "TrainerSessionMode" NOT NULL DEFAULT 'IN_PERSON',
    "area" TEXT,
    "locationDetails" TEXT,
    "hourlyRate" DECIMAL(10,2),
    "facebookPage" TEXT,
    "paymentMode" "PartnerPaymentMode" NOT NULL DEFAULT 'AUTOMATIC',
    "submittedAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "deactivatedAt" TIMESTAMP(3),
    "deactivationReason" TEXT,
    "facebookReviewedAt" TIMESTAMP(3),
    "facebookReviewedById" TEXT,
    "serviceFeeReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAvailabilityRule" (
    "id" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerAvailabilityException" (
    "id" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "type" "TrainerAvailabilityExceptionType" NOT NULL,
    "note" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerAvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerSession" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "TrainerSessionStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "trainerAmount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "processingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "requestExpiresAt" TIMESTAMP(3) NOT NULL,
    "paymentExpiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "CancelledBy",
    "cancelReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "prevDate" TEXT,
    "prevStartHour" INTEGER,
    "prevEndHour" INTEGER,
    "rescheduledAt" TIMESTAMP(3),
    "rescheduledById" TEXT,
    "rescheduleReason" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerSessionSlot" (
    "id" TEXT NOT NULL,
    "trainerProfileId" TEXT NOT NULL,
    "trainerSessionId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,

    CONSTRAINT "TrainerSessionSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerGateway" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paymongo',
    "publicKey" TEXT NOT NULL,
    "secretKeyEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT NOT NULL,
    "secretKeyHint" TEXT NOT NULL,
    "webhookToken" TEXT NOT NULL,
    "webhookVersion" INTEGER NOT NULL DEFAULT 1,
    "accountLabel" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerManualPaymentMethod" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "network" "ManualPaymentNetwork" NOT NULL,
    "label" TEXT NOT NULL,
    "accountName" TEXT,
    "accountIdentifier" TEXT,
    "instructions" TEXT,
    "qrImage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerManualPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerPayment" (
    "id" TEXT NOT NULL,
    "trainerSessionId" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "manualPaymentMethodId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "trainerAmount" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "processingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "method" "PaymentMethodType" NOT NULL,
    "collectionMode" "PaymentCollectionMode" NOT NULL DEFAULT 'AUTOMATIC',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "chargeStartedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "providerClientKey" TEXT,
    "redirectUrl" TEXT,
    "qrImageUrl" TEXT,
    "providerRef" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "raw" JSONB,
    "manualMethodLabel" TEXT,
    "manualAccountName" TEXT,
    "manualAccountDetails" TEXT,
    "manualInstructions" TEXT,
    "manualQrImage" TEXT,
    "manualReceiptImage" TEXT,
    "manualPaymentRef" TEXT,
    "manualSubmittedAt" TIMESTAMP(3),
    "manualReviewedAt" TIMESTAMP(3),
    "manualReviewedById" TEXT,
    "manualReviewNote" TEXT,
    "paidAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "refundedAmount" DECIMAL(10,2),
    "refundRef" TEXT,
    "refundReason" TEXT,
    "refundedById" TEXT,
    "refundRequestedAt" TIMESTAMP(3),
    "refundRequestedById" TEXT,
    "refundStartedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerServiceFeeEntry" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "trainerPaymentId" TEXT NOT NULL,
    "type" "ServiceFeeEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainerServiceFeeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerServiceFeeSettlement" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "ServiceFeeSettlementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "paymentReference" TEXT,
    "receiptImage" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerServiceFeeSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_userId_key" ON "TrainerProfile"("userId");

-- CreateIndex
CREATE INDEX "TrainerProfile_status_updatedAt_idx" ON "TrainerProfile"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "TrainerProfile_sessionMode_area_idx" ON "TrainerProfile"("sessionMode", "area");

-- CreateIndex
CREATE INDEX "TrainerAvailabilityRule_trainerProfileId_dayOfWeek_idx" ON "TrainerAvailabilityRule"("trainerProfileId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAvailabilityRule_trainerProfileId_dayOfWeek_startHou_key" ON "TrainerAvailabilityRule"("trainerProfileId", "dayOfWeek", "startHour", "endHour");

-- CreateIndex
CREATE INDEX "TrainerAvailabilityException_trainerProfileId_date_idx" ON "TrainerAvailabilityException"("trainerProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerAvailabilityException_trainerProfileId_date_startHou_key" ON "TrainerAvailabilityException"("trainerProfileId", "date", "startHour", "endHour", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerSession_publicId_key" ON "TrainerSession"("publicId");

-- CreateIndex
CREATE INDEX "TrainerSession_trainerProfileId_status_startsAt_idx" ON "TrainerSession"("trainerProfileId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "TrainerSession_playerId_status_startsAt_idx" ON "TrainerSession"("playerId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "TrainerSession_status_requestExpiresAt_idx" ON "TrainerSession"("status", "requestExpiresAt");

-- CreateIndex
CREATE INDEX "TrainerSession_status_paymentExpiresAt_idx" ON "TrainerSession"("status", "paymentExpiresAt");

-- CreateIndex
CREATE INDEX "TrainerSession_status_startsAt_idx" ON "TrainerSession"("status", "startsAt");

-- CreateIndex
CREATE INDEX "TrainerSessionSlot_trainerSessionId_idx" ON "TrainerSessionSlot"("trainerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerSessionSlot_trainerProfileId_date_hour_key" ON "TrainerSessionSlot"("trainerProfileId", "date", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerGateway_userId_key" ON "TrainerGateway"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerGateway_webhookToken_key" ON "TrainerGateway"("webhookToken");

-- CreateIndex
CREATE INDEX "TrainerManualPaymentMethod_trainerId_active_sortOrder_idx" ON "TrainerManualPaymentMethod"("trainerId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerPayment_trainerSessionId_key" ON "TrainerPayment"("trainerSessionId");

-- CreateIndex
CREATE INDEX "TrainerPayment_trainerId_createdAt_idx" ON "TrainerPayment"("trainerId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainerPayment_playerId_createdAt_idx" ON "TrainerPayment"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "TrainerPayment_providerPaymentId_idx" ON "TrainerPayment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "TrainerPayment_status_expiresAt_idx" ON "TrainerPayment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "TrainerServiceFeeEntry_trainerId_createdAt_idx" ON "TrainerServiceFeeEntry"("trainerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerServiceFeeEntry_trainerPaymentId_type_key" ON "TrainerServiceFeeEntry"("trainerPaymentId", "type");

-- CreateIndex
CREATE INDEX "TrainerServiceFeeSettlement_trainerId_submittedAt_idx" ON "TrainerServiceFeeSettlement"("trainerId", "submittedAt");

-- CreateIndex
CREATE INDEX "TrainerServiceFeeSettlement_status_submittedAt_idx" ON "TrainerServiceFeeSettlement"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_trainerSessionId_key" ON "ChatConversation"("trainerSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAvailabilityRule" ADD CONSTRAINT "TrainerAvailabilityRule_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerAvailabilityException" ADD CONSTRAINT "TrainerAvailabilityException_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerSession" ADD CONSTRAINT "TrainerSession_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerSession" ADD CONSTRAINT "TrainerSession_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerSessionSlot" ADD CONSTRAINT "TrainerSessionSlot_trainerProfileId_fkey" FOREIGN KEY ("trainerProfileId") REFERENCES "TrainerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerSessionSlot" ADD CONSTRAINT "TrainerSessionSlot_trainerSessionId_fkey" FOREIGN KEY ("trainerSessionId") REFERENCES "TrainerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerGateway" ADD CONSTRAINT "TrainerGateway_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerManualPaymentMethod" ADD CONSTRAINT "TrainerManualPaymentMethod_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPayment" ADD CONSTRAINT "TrainerPayment_trainerSessionId_fkey" FOREIGN KEY ("trainerSessionId") REFERENCES "TrainerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPayment" ADD CONSTRAINT "TrainerPayment_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPayment" ADD CONSTRAINT "TrainerPayment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPayment" ADD CONSTRAINT "TrainerPayment_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "TrainerGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerPayment" ADD CONSTRAINT "TrainerPayment_manualPaymentMethodId_fkey" FOREIGN KEY ("manualPaymentMethodId") REFERENCES "TrainerManualPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerServiceFeeEntry" ADD CONSTRAINT "TrainerServiceFeeEntry_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerServiceFeeEntry" ADD CONSTRAINT "TrainerServiceFeeEntry_trainerPaymentId_fkey" FOREIGN KEY ("trainerPaymentId") REFERENCES "TrainerPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerServiceFeeSettlement" ADD CONSTRAINT "TrainerServiceFeeSettlement_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_trainerSessionId_fkey" FOREIGN KEY ("trainerSessionId") REFERENCES "TrainerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Domain invariants that should remain true even if a future caller bypasses
-- the Server Actions and writes directly through Prisma.
ALTER TABLE "TrainerAvailabilityRule"
  ADD CONSTRAINT "TrainerAvailabilityRule_valid_hours" CHECK (
    "dayOfWeek" BETWEEN 0 AND 6 AND
    "startHour" BETWEEN 0 AND 23 AND
    "endHour" BETWEEN 1 AND 24 AND
    "startHour" < "endHour"
  );

ALTER TABLE "TrainerAvailabilityException"
  ADD CONSTRAINT "TrainerAvailabilityException_valid_date_hours" CHECK (
    "date" ~ '^\d{4}-\d{2}-\d{2}$' AND
    "startHour" BETWEEN 0 AND 23 AND
    "endHour" BETWEEN 1 AND 24 AND
    "startHour" < "endHour"
  );

ALTER TABLE "TrainerSession"
  ADD CONSTRAINT "TrainerSession_valid_date_hours_amounts" CHECK (
    "date" ~ '^\d{4}-\d{2}-\d{2}$' AND
    "startHour" BETWEEN 0 AND 23 AND
    "endHour" BETWEEN 1 AND 24 AND
    "hours" = "endHour" - "startHour" AND
    "hours" > 0 AND
    "hourlyRate" > 0 AND
    "trainerAmount" >= 0 AND
    "platformFee" >= 0 AND
    "processingFee" >= 0 AND
    "totalAmount" >= "trainerAmount" + "platformFee"
  );

ALTER TABLE "TrainerSessionSlot"
  ADD CONSTRAINT "TrainerSessionSlot_valid_date_hour" CHECK (
    "date" ~ '^\d{4}-\d{2}-\d{2}$' AND "hour" BETWEEN 0 AND 23
  );

ALTER TABLE "TrainerPayment"
  ADD CONSTRAINT "TrainerPayment_nonnegative_amounts" CHECK (
    "amount" >= 0 AND "trainerAmount" >= 0 AND
    "platformFee" >= 0 AND "processingFee" >= 0 AND
    ("refundedAmount" IS NULL OR "refundedAmount" >= 0)
  );

ALTER TABLE "TrainerServiceFeeSettlement"
  ADD CONSTRAINT "TrainerServiceFeeSettlement_positive_amount" CHECK ("amount" > 0);
