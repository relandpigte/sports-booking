-- Automatic payments move from each venue's or trainer's own PayMongo account
-- to Bunal.club's account. This migration is additive: every existing payment
-- keeps the DIRECT default, and nothing writes PLATFORM rows until the
-- application cutover.

-- CreateEnum
CREATE TYPE "PaymentCollector" AS ENUM ('DIRECT', 'PLATFORM');

-- CreateEnum
CREATE TYPE "PayoutNetwork" AS ENUM ('GCASH', 'MAYA', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PayoutRecipientKind" AS ENUM ('VENUE', 'TRAINER');

-- CreateEnum
CREATE TYPE "PayoutEntryType" AS ENUM ('EARNING', 'REFUND');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "TrainerPayment" ADD COLUMN     "collectedBy" "PaymentCollector" NOT NULL DEFAULT 'DIRECT';

-- AlterTable
ALTER TABLE "PlatformGateway" ADD COLUMN     "environment" "TransactionEnvironment" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "webhookVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "BookingPayment" ADD COLUMN     "collectedBy" "PaymentCollector" NOT NULL DEFAULT 'DIRECT',
ADD COLUMN     "refundStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PayoutAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "network" "PayoutNetwork" NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayoutAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutEntry" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientKind" "PayoutRecipientKind" NOT NULL,
    "bookingPaymentId" TEXT,
    "trainerPaymentId" TEXT,
    "type" "PayoutEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientKind" "PayoutRecipientKind" NOT NULL,
    "cutoffAt" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "network" "PayoutNetwork" NOT NULL,
    "bankName" TEXT,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAccount_userId_key" ON "PayoutAccount"("userId");

-- CreateIndex
CREATE INDEX "PayoutEntry_recipientId_recipientKind_payoutId_effectiveAt_idx" ON "PayoutEntry"("recipientId", "recipientKind", "payoutId", "effectiveAt");

-- CreateIndex
CREATE INDEX "PayoutEntry_payoutId_idx" ON "PayoutEntry"("payoutId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutEntry_bookingPaymentId_type_key" ON "PayoutEntry"("bookingPaymentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutEntry_trainerPaymentId_type_key" ON "PayoutEntry"("trainerPaymentId", "type");

-- CreateIndex
CREATE INDEX "Payout_status_cutoffAt_idx" ON "Payout"("status", "cutoffAt");

-- CreateIndex
CREATE INDEX "Payout_recipientId_recipientKind_createdAt_idx" ON "Payout"("recipientId", "recipientKind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_recipientId_recipientKind_cutoffAt_key" ON "Payout"("recipientId", "recipientKind", "cutoffAt");

-- CreateIndex
CREATE INDEX "TrainerPayment_collectedBy_status_idx" ON "TrainerPayment"("collectedBy", "status");

-- CreateIndex
CREATE INDEX "BookingPayment_collectedBy_status_idx" ON "BookingPayment"("collectedBy", "status");

-- AddForeignKey
ALTER TABLE "PayoutAccount" ADD CONSTRAINT "PayoutAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEntry" ADD CONSTRAINT "PayoutEntry_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEntry" ADD CONSTRAINT "PayoutEntry_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "BookingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEntry" ADD CONSTRAINT "PayoutEntry_trainerPaymentId_fkey" FOREIGN KEY ("trainerPaymentId") REFERENCES "TrainerPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutEntry" ADD CONSTRAINT "PayoutEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The platform key mode used to be recoverable only from the display label.
UPDATE "PlatformGateway"
SET "environment" = CASE
  WHEN "accountLabel" LIKE '%(live mode)%' THEN 'LIVE'::"TransactionEnvironment"
  WHEN "accountLabel" LIKE '%(test mode)%' THEN 'TEST'::"TransactionEnvironment"
  ELSE 'UNKNOWN'::"TransactionEnvironment"
END;

-- A platform-collected payment never has a venue or trainer gateway, and is
-- never a manual transfer.
ALTER TABLE "BookingPayment"
  ADD CONSTRAINT "BookingPayment_platform_collection_check" CHECK (
    "collectedBy" = 'DIRECT' OR
    ("gatewayId" IS NULL AND "collectionMode" = 'AUTOMATIC')
  );

ALTER TABLE "TrainerPayment"
  ADD CONSTRAINT "TrainerPayment_platform_collection_check" CHECK (
    "collectedBy" = 'DIRECT' OR
    ("gatewayId" IS NULL AND "collectionMode" = 'AUTOMATIC')
  );

-- A processing fee absorbed by Bunal.club is not part of what the player
-- pays. The previous constraint counted it unconditionally, which rejected
-- every automatic trainer checkout that recorded an absorbed fee.
ALTER TABLE "TrainerSession"
  DROP CONSTRAINT IF EXISTS "TrainerSession_valid_date_hours_amounts";

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
    "totalAmount" = "trainerAmount" + "platformFee" +
      CASE WHEN "processingFeeResponsibility" = 'PLAYER'
        THEN "processingFee" ELSE 0 END
  );

ALTER TABLE "TrainerPayment"
  DROP CONSTRAINT IF EXISTS "TrainerPayment_nonnegative_amounts";

ALTER TABLE "TrainerPayment"
  ADD CONSTRAINT "TrainerPayment_nonnegative_amounts" CHECK (
    "amount" >= 0 AND "trainerAmount" >= 0 AND
    "platformFee" >= 0 AND "processingFee" >= 0 AND
    "amount" = "trainerAmount" + "platformFee" +
      CASE WHEN "processingFeeResponsibility" = 'PLAYER'
        THEN "processingFee" ELSE 0 END AND
    ("refundedAmount" IS NULL OR "refundedAmount" >= 0)
  );

ALTER TABLE "PayoutAccount"
  ADD CONSTRAINT "PayoutAccount_complete_destination_check" CHECK (
    btrim("accountName") <> '' AND
    btrim("accountNumber") <> '' AND
    ("network" <> 'BANK_TRANSFER' OR
      ("bankName" IS NOT NULL AND btrim("bankName") <> ''))
  );

-- An entry comes from one payment, and the kind of recipient always matches
-- the kind of payment. The source may later be NULL: the ledger outlives a
-- deleted payment so money already owed or paid is never rewritten.
ALTER TABLE "PayoutEntry"
  ADD CONSTRAINT "PayoutEntry_single_matching_source_check" CHECK (
    num_nonnulls("bookingPaymentId", "trainerPaymentId") <= 1 AND
    ("bookingPaymentId" IS NULL OR "recipientKind" = 'VENUE') AND
    ("trainerPaymentId" IS NULL OR "recipientKind" = 'TRAINER')
  );

ALTER TABLE "PayoutEntry"
  ADD CONSTRAINT "PayoutEntry_signed_amount_check" CHECK (
    ("type" = 'EARNING' AND "amount" > 0) OR
    ("type" = 'REFUND' AND "amount" < 0)
  );

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_positive_amount_check" CHECK ("amount" > 0);

ALTER TABLE "Payout"
  ADD CONSTRAINT "Payout_paid_state_check" CHECK (
    ("status" = 'PENDING' AND "paidAt" IS NULL AND "reference" IS NULL) OR
    ("status" = 'PAID' AND "paidAt" IS NOT NULL AND
      "reference" IS NOT NULL AND btrim("reference") <> '')
  );
