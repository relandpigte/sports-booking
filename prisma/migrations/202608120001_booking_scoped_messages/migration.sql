-- CreateEnum
CREATE TYPE "ChatConversationKind" AS ENUM ('EVENT', 'HUB_PLAYER');

-- CreateEnum
CREATE TYPE "ChatMessageKind" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ChatReportCategory" AS ENUM ('SPAM', 'HARASSMENT', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChatReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "chatRestrictedAt" TIMESTAMP(3),
ADD COLUMN     "chatRestrictedById" TEXT,
ADD COLUMN     "chatRestrictionReason" VARCHAR(200);

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "confirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "kind" "ChatConversationKind" NOT NULL,
    "hubId" TEXT,
    "eventId" TEXT,
    "playerId" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT,
    "kind" "ChatMessageKind" NOT NULL DEFAULT 'USER',
    "body" VARCHAR(2000),
    "systemType" VARCHAR(60),
    "systemKey" VARCHAR(160),
    "targetPath" VARCHAR(500),
    "clientNonce" VARCHAR(80),
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadState" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "ChatBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "ChatReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reporterId" TEXT,
    "category" "ChatReportCategory" NOT NULL,
    "details" VARCHAR(500),
    "evidenceBody" VARCHAR(2000),
    "status" "ChatReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewerId" TEXT,
    "resolution" VARCHAR(500),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_eventId_key" ON "ChatConversation"("eventId");

-- CreateIndex
CREATE INDEX "ChatConversation_kind_lastMessageAt_idx" ON "ChatConversation"("kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_playerId_lastMessageAt_idx" ON "ChatConversation"("playerId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_hubId_playerId_key" ON "ChatConversation"("hubId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_systemKey_key" ON "ChatMessage"("systemKey");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_createdAt_idx" ON "ChatMessage"("senderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_conversationId_senderId_clientNonce_key" ON "ChatMessage"("conversationId", "senderId", "clientNonce");

-- CreateIndex
CREATE INDEX "ChatReadState_userId_lastReadAt_idx" ON "ChatReadState"("userId", "lastReadAt");

-- CreateIndex
CREATE INDEX "ChatBlock_blockedId_idx" ON "ChatBlock"("blockedId");

-- CreateIndex
CREATE INDEX "ChatReport_status_createdAt_idx" ON "ChatReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChatReport_messageId_idx" ON "ChatReport"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReport_messageId_reporterId_key" ON "ChatReport"("messageId", "reporterId");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBlock" ADD CONSTRAINT "ChatBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill the first moment existing confirmed bookings became messageable.
-- Successful-payment time is the best available source; bookings that never
-- required online payment use their creation time.
UPDATE "Booking" AS booking
SET "confirmedAt" = COALESCE(payment."paidAt", booking."createdAt")
FROM "BookingPayment" AS payment
WHERE booking."bookingPaymentId" = payment."id"
  AND booking."status" = 'CONFIRMED'
  AND booking."confirmedAt" IS NULL;

UPDATE "Booking"
SET "confirmedAt" = "createdAt"
WHERE "status" = 'CONFIRMED' AND "confirmedAt" IS NULL;

-- Conversation ids are deterministic only for this one-time backfill. New
-- conversations use Prisma's normal cuid() ids.
INSERT INTO "ChatConversation"
  ("id", "kind", "hubId", "eventId", "playerId", "createdAt", "updatedAt")
SELECT
  'chat_event_' || md5(event."id"),
  'EVENT'::"ChatConversationKind",
  event."hubId",
  event."id",
  NULL,
  event."createdAt",
  CURRENT_TIMESTAMP
FROM "Event" AS event
ON CONFLICT ("eventId") DO NOTHING;

INSERT INTO "ChatConversation"
  ("id", "kind", "hubId", "eventId", "playerId", "createdAt", "updatedAt")
SELECT
  'chat_hub_' || md5(booking."hubId" || ':' || booking."userId"),
  'HUB_PLAYER'::"ChatConversationKind",
  booking."hubId",
  NULL,
  booking."userId",
  MIN(COALESCE(booking."confirmedAt", booking."createdAt")),
  CURRENT_TIMESTAMP
FROM "Booking" AS booking
WHERE booking."status" = 'CONFIRMED'
GROUP BY booking."hubId", booking."userId"
ON CONFLICT ("hubId", "playerId") DO NOTHING;
