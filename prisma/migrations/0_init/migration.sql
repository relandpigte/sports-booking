-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PLAYER', 'PARTNER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('DRAFT', 'PENDING', 'ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "PartnerPaymentMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentCollectionMode" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "ManualPaymentNetwork" AS ENUM ('GCASH', 'MAYA', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('QRPH', 'CARD', 'GCASH', 'MAYA', 'BANK_TRANSFER', 'OTHER', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "ServiceFeeEntryType" AS ENUM ('CHARGE', 'REFUND');

-- CreateEnum
CREATE TYPE "ServiceFeeSettlementStatus" AS ENUM ('AWAITING_PAYMENT', 'SUBMITTED', 'PAID', 'REJECTED');

-- CreateEnum
CREATE TYPE "CourtBlockType" AS ENUM ('WALK_IN', 'MAINTENANCE', 'PRIVATE_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CancelledBy" AS ENUM ('PLAYER', 'PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "RescheduledBy" AS ENUM ('PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "playerName" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "phone" TEXT,
    "facebookPage" TEXT,
    "image" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'PLAYER',
    "skillLevel" TEXT NOT NULL DEFAULT 'intermediate',
    "privateProfile" BOOLEAN NOT NULL DEFAULT false,
    "registrationCompletedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "mfaEnabledAt" TIMESTAMP(3),
    "mfaSecretEnc" TEXT,
    "partnerStatus" "PartnerStatus",
    "partnerPaymentMode" "PartnerPaymentMode" NOT NULL DEFAULT 'AUTOMATIC',
    "partnerActivatedAt" TIMESTAMP(3),
    "serviceFeeReminderAt" TIMESTAMP(3),
    "partnerActivatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthGrant" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "browser" TEXT,
    "operatingSystem" TEXT,
    "location" TEXT,
    "ipHash" TEXT NOT NULL,
    "ipPrefix" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mfaVerified" BOOLEAN NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "deviceLabel" TEXT NOT NULL,
    "browser" TEXT,
    "operatingSystem" TEXT,
    "location" TEXT,
    "ipHash" TEXT NOT NULL,
    "ipPrefix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityChallenge" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "secretEnc" TEXT,
    "redirectTo" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "location" TEXT,
    "ipHash" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginThrottle" (
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("keyHash")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerGateway" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'fake',
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

    CONSTRAINT "PartnerGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerManualPaymentMethod" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
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

    CONSTRAINT "PartnerManualPaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformGateway" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'paymongo',
    "secretKeyEnc" TEXT NOT NULL,
    "webhookSecretEnc" TEXT NOT NULL,
    "secretKeyHint" TEXT NOT NULL,
    "webhookUrl" TEXT,
    "accountLabel" TEXT,
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingPayment" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "gatewayId" TEXT,
    "userId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "venueAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
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
    "manualPaymentMethodId" TEXT,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFeeEntry" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "bookingPaymentId" TEXT NOT NULL,
    "type" "ServiceFeeEntryType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceFeeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceFeeSettlement" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PHP',
    "status" "ServiceFeeSettlementStatus" NOT NULL DEFAULT 'SUBMITTED',
    "paymentReference" TEXT,
    "receiptImage" TEXT,
    "provider" TEXT,
    "providerPaymentId" TEXT,
    "providerRef" TEXT,
    "redirectUrl" TEXT,
    "raw" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceFeeSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerImpersonationSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "lastActionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerImpersonationAudit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "adminId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerImpersonationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "about" TEXT,
    "logo" TEXT,
    "coverPhotos" TEXT[],
    "games" TEXT[],
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" TEXT,
    "email" TEXT,
    "operatingHours" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Court" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courtType" TEXT NOT NULL DEFAULT 'covered',
    "hourlyRate" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Court_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtBlock" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "type" "CourtBlockType" NOT NULL,
    "date" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "publicReason" VARCHAR(120),
    "customerName" VARCHAR(120),
    "customerPhone" VARCHAR(40),
    "amountPaid" DECIMAL(10,2),
    "internalNote" VARCHAR(500),
    "createdById" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtSlotRule" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closureReason" VARCHAR(120),
    "hourlyRate" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourtSlotRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "hourlyRate" DECIMAL(10,2),
    "totalPrice" DECIMAL(10,2),
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "CancelledBy",
    "cancelReason" TEXT,
    "rescheduledAt" TIMESTAMP(3),
    "rescheduledBy" "RescheduledBy",
    "rescheduleReason" TEXT,
    "rescheduleCount" INTEGER NOT NULL DEFAULT 0,
    "prevCourtName" TEXT,
    "prevDate" TEXT,
    "prevStartHour" INTEGER,
    "prevEndHour" INTEGER,
    "prevTotalPrice" DECIMAL(10,2),
    "holdExpiresAt" TIMESTAMP(3),
    "bookingPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingSlot" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "eventId" TEXT,
    "blockId" TEXT,
    "courtId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "hour" INTEGER NOT NULL,
    "holdExpiresAt" TIMESTAMP(3),

    CONSTRAINT "BookingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sport" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "registrationFee" DECIMAL(10,2) NOT NULL,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCourt" (
    "eventId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,

    CONSTRAINT "EventCourt_pkey" PRIMARY KEY ("eventId","courtId")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "holdExpiresAt" TIMESTAMP(3),
    "bookingPaymentId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventGuestSlot" (
    "id" TEXT NOT NULL,
    "eventRegistrationId" TEXT NOT NULL,
    "bookingPaymentId" TEXT,
    "name" TEXT NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "holdExpiresAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventGuestSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventOrganizerGuest" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOrganizerGuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthGrant_tokenHash_key" ON "AuthGrant"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthGrant_userId_expiresAt_idx" ON "AuthGrant"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthGrant_expiresAt_idx" ON "AuthGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityChallenge_tokenHash_key" ON "SecurityChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "SecurityChallenge_userId_purpose_expiresAt_idx" ON "SecurityChallenge"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "SecurityChallenge_expiresAt_idx" ON "SecurityChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_codeHash_key" ON "MfaRecoveryCode"("codeHash");

-- CreateIndex
CREATE INDEX "MfaRecoveryCode_userId_usedAt_idx" ON "MfaRecoveryCode"("userId", "usedAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "LoginThrottle_blockedUntil_idx" ON "LoginThrottle"("blockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_emailHash_key" ON "PasswordResetToken"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_userId_key" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerGateway_userId_key" ON "PartnerGateway"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerGateway_webhookToken_key" ON "PartnerGateway"("webhookToken");

-- CreateIndex
CREATE INDEX "PartnerManualPaymentMethod_partnerId_active_sortOrder_idx" ON "PartnerManualPaymentMethod"("partnerId", "active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformGateway_provider_key" ON "PlatformGateway"("provider");

-- CreateIndex
CREATE INDEX "BookingPayment_partnerId_createdAt_idx" ON "BookingPayment"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingPayment_userId_createdAt_idx" ON "BookingPayment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingPayment_hubId_createdAt_idx" ON "BookingPayment"("hubId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingPayment_providerPaymentId_idx" ON "BookingPayment"("providerPaymentId");

-- CreateIndex
CREATE INDEX "BookingPayment_manualPaymentMethodId_idx" ON "BookingPayment"("manualPaymentMethodId");

-- CreateIndex
CREATE INDEX "BookingPayment_partnerId_manualSubmittedAt_idx" ON "BookingPayment"("partnerId", "manualSubmittedAt");

-- CreateIndex
CREATE INDEX "BookingPayment_status_expiresAt_idx" ON "BookingPayment"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ServiceFeeEntry_partnerId_createdAt_idx" ON "ServiceFeeEntry"("partnerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFeeEntry_bookingPaymentId_type_key" ON "ServiceFeeEntry"("bookingPaymentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceFeeSettlement_providerPaymentId_key" ON "ServiceFeeSettlement"("providerPaymentId");

-- CreateIndex
CREATE INDEX "ServiceFeeSettlement_partnerId_submittedAt_idx" ON "ServiceFeeSettlement"("partnerId", "submittedAt");

-- CreateIndex
CREATE INDEX "ServiceFeeSettlement_status_submittedAt_idx" ON "ServiceFeeSettlement"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEvent_provider_eventId_key" ON "ProviderEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerImpersonationSession_tokenHash_key" ON "PartnerImpersonationSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PartnerImpersonationSession_adminId_endedAt_expiresAt_idx" ON "PartnerImpersonationSession"("adminId", "endedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "PartnerImpersonationSession_partnerId_startedAt_idx" ON "PartnerImpersonationSession"("partnerId", "startedAt");

-- CreateIndex
CREATE INDEX "PartnerImpersonationAudit_partnerId_createdAt_idx" ON "PartnerImpersonationAudit"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerImpersonationAudit_adminId_createdAt_idx" ON "PartnerImpersonationAudit"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerImpersonationAudit_sessionId_createdAt_idx" ON "PartnerImpersonationAudit"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Hub_slug_key" ON "Hub"("slug");

-- CreateIndex
CREATE INDEX "Hub_ownerId_idx" ON "Hub"("ownerId");

-- CreateIndex
CREATE INDEX "Court_hubId_idx" ON "Court"("hubId");

-- CreateIndex
CREATE INDEX "CourtBlock_hubId_date_releasedAt_idx" ON "CourtBlock"("hubId", "date", "releasedAt");

-- CreateIndex
CREATE INDEX "CourtBlock_date_endHour_idx" ON "CourtBlock"("date", "endHour");

-- CreateIndex
CREATE INDEX "CourtSlotRule_courtId_weekday_idx" ON "CourtSlotRule"("courtId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "CourtSlotRule_courtId_weekday_hour_key" ON "CourtSlotRule"("courtId", "weekday", "hour");

-- CreateIndex
CREATE INDEX "Booking_userId_startsAt_idx" ON "Booking"("userId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_hubId_startsAt_idx" ON "Booking"("hubId", "startsAt");

-- CreateIndex
CREATE INDEX "Booking_courtId_date_idx" ON "Booking"("courtId", "date");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "BookingSlot_bookingId_idx" ON "BookingSlot"("bookingId");

-- CreateIndex
CREATE INDEX "BookingSlot_eventId_idx" ON "BookingSlot"("eventId");

-- CreateIndex
CREATE INDEX "BookingSlot_blockId_idx" ON "BookingSlot"("blockId");

-- CreateIndex
CREATE INDEX "BookingSlot_courtId_date_idx" ON "BookingSlot"("courtId", "date");

-- CreateIndex
CREATE INDEX "BookingSlot_courtId_date_holdExpiresAt_idx" ON "BookingSlot"("courtId", "date", "holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSlot_courtId_date_hour_key" ON "BookingSlot"("courtId", "date", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "Event_publicId_key" ON "Event"("publicId");

-- CreateIndex
CREATE INDEX "Event_hubId_startsAt_idx" ON "Event"("hubId", "startsAt");

-- CreateIndex
CREATE INDEX "Event_status_startsAt_idx" ON "Event"("status", "startsAt");

-- CreateIndex
CREATE INDEX "EventCourt_courtId_idx" ON "EventCourt"("courtId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_bookingPaymentId_key" ON "EventRegistration"("bookingPaymentId");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_createdAt_idx" ON "EventRegistration"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventRegistration_userId_createdAt_idx" ON "EventRegistration"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_userId_key" ON "EventRegistration"("eventId", "userId");

-- CreateIndex
CREATE INDEX "EventGuestSlot_eventRegistrationId_status_createdAt_idx" ON "EventGuestSlot"("eventRegistrationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventGuestSlot_bookingPaymentId_idx" ON "EventGuestSlot"("bookingPaymentId");

-- CreateIndex
CREATE INDEX "EventGuestSlot_status_holdExpiresAt_idx" ON "EventGuestSlot"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "EventOrganizerGuest_eventId_status_createdAt_idx" ON "EventOrganizerGuest"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventOrganizerGuest_createdById_createdAt_idx" ON "EventOrganizerGuest"("createdById", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "AuthGrant" ADD CONSTRAINT "AuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityChallenge" ADD CONSTRAINT "SecurityChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MfaRecoveryCode" ADD CONSTRAINT "MfaRecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerGateway" ADD CONSTRAINT "PartnerGateway_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerManualPaymentMethod" ADD CONSTRAINT "PartnerManualPaymentMethod_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_gatewayId_fkey" FOREIGN KEY ("gatewayId") REFERENCES "PartnerGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingPayment" ADD CONSTRAINT "BookingPayment_manualPaymentMethodId_fkey" FOREIGN KEY ("manualPaymentMethodId") REFERENCES "PartnerManualPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeeEntry" ADD CONSTRAINT "ServiceFeeEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeeEntry" ADD CONSTRAINT "ServiceFeeEntry_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "BookingPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeeSettlement" ADD CONSTRAINT "ServiceFeeSettlement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hub" ADD CONSTRAINT "Hub_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Court" ADD CONSTRAINT "Court_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtBlock" ADD CONSTRAINT "CourtBlock_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtSlotRule" ADD CONSTRAINT "CourtSlotRule_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "BookingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingSlot" ADD CONSTRAINT "BookingSlot_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "CourtBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCourt" ADD CONSTRAINT "EventCourt_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCourt" ADD CONSTRAINT "EventCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "BookingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGuestSlot" ADD CONSTRAINT "EventGuestSlot_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventGuestSlot" ADD CONSTRAINT "EventGuestSlot_bookingPaymentId_fkey" FOREIGN KEY ("bookingPaymentId") REFERENCES "BookingPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizerGuest" ADD CONSTRAINT "EventOrganizerGuest_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizerGuest" ADD CONSTRAINT "EventOrganizerGuest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
