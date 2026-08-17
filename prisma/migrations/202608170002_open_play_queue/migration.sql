ALTER TABLE "PartnerStaffMembership" ADD COLUMN "openPlay" "StaffAccessLevel" NOT NULL DEFAULT 'NONE';
ALTER TABLE "PartnerStaffInvitation" ADD COLUMN "openPlay" "StaffAccessLevel" NOT NULL DEFAULT 'NONE';

CREATE TYPE "OpenPlaySessionStatus" AS ENUM ('SETUP', 'ACTIVE', 'ENDED');
CREATE TYPE "OpenPlayMatchingMode" AS ENUM ('BALANCED', 'SKILL_SEPARATED', 'WINNERS_LOSERS', 'FIXED_PARTNERS');
CREATE TYPE "OpenPlayParticipantSource" AS ENUM ('REGISTERED_PLAYER', 'REGISTRATION_GUEST', 'ORGANIZER_GUEST', 'WALK_IN');
CREATE TYPE "OpenPlayParticipantStatus" AS ENUM ('NOT_CHECKED_IN', 'QUEUED', 'STAGED', 'PLAYING', 'PAUSED', 'CHECKED_OUT');
CREATE TYPE "OpenPlayLastResult" AS ENUM ('UNCLASSIFIED', 'WIN', 'LOSS');
CREATE TYPE "OpenPlayGameStatus" AS ENUM ('STAGED', 'ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "OpenPlaySelectionMethod" AS ENUM ('AUTOMATIC', 'MANUAL');

CREATE TABLE "OpenPlaySession" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "status" "OpenPlaySessionStatus" NOT NULL DEFAULT 'SETUP',
  "matchingMode" "OpenPlayMatchingMode" NOT NULL DEFAULT 'BALANCED',
  "nextQueuePosition" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpenPlaySession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpenPlaySessionCourt" (
  "sessionId" TEXT NOT NULL,
  "courtId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "OpenPlaySessionCourt_pkey" PRIMARY KEY ("sessionId", "courtId")
);

CREATE TABLE "OpenPlayPair" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OpenPlayPair_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpenPlayParticipant" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "source" "OpenPlayParticipantSource" NOT NULL,
  "userId" TEXT,
  "eventRegistrationId" TEXT,
  "eventGuestSlotId" TEXT,
  "organizerGuestId" TEXT,
  "pairId" TEXT,
  "displayName" VARCHAR(120) NOT NULL,
  "skillLevel" VARCHAR(24) NOT NULL DEFAULT 'intermediate',
  "status" "OpenPlayParticipantStatus" NOT NULL DEFAULT 'NOT_CHECKED_IN',
  "lastResult" "OpenPlayLastResult" NOT NULL DEFAULT 'UNCLASSIFIED',
  "queuePosition" INTEGER,
  "checkedInAt" TIMESTAMP(3),
  "queuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpenPlayParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpenPlayGame" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "courtId" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "matchingMode" "OpenPlayMatchingMode" NOT NULL,
  "selectionMethod" "OpenPlaySelectionMethod" NOT NULL DEFAULT 'AUTOMATIC',
  "status" "OpenPlayGameStatus" NOT NULL DEFAULT 'STAGED',
  "winningTeam" INTEGER,
  "createdById" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpenPlayGame_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpenPlayGamePlayer" (
  "id" TEXT NOT NULL,
  "gameId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "team" INTEGER NOT NULL,
  "slot" INTEGER NOT NULL,
  "queuePositionBefore" INTEGER NOT NULL,
  CONSTRAINT "OpenPlayGamePlayer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OpenPlaySession_eventId_key" ON "OpenPlaySession"("eventId");
CREATE INDEX "OpenPlaySession_status_updatedAt_idx" ON "OpenPlaySession"("status", "updatedAt");
CREATE UNIQUE INDEX "OpenPlaySessionCourt_sessionId_position_key" ON "OpenPlaySessionCourt"("sessionId", "position");
CREATE INDEX "OpenPlaySessionCourt_courtId_idx" ON "OpenPlaySessionCourt"("courtId");
CREATE INDEX "OpenPlayPair_sessionId_idx" ON "OpenPlayPair"("sessionId");
CREATE UNIQUE INDEX "OpenPlayParticipant_sessionId_eventRegistrationId_key" ON "OpenPlayParticipant"("sessionId", "eventRegistrationId");
CREATE UNIQUE INDEX "OpenPlayParticipant_sessionId_eventGuestSlotId_key" ON "OpenPlayParticipant"("sessionId", "eventGuestSlotId");
CREATE UNIQUE INDEX "OpenPlayParticipant_sessionId_organizerGuestId_key" ON "OpenPlayParticipant"("sessionId", "organizerGuestId");
CREATE INDEX "OpenPlayParticipant_sessionId_status_queuePosition_idx" ON "OpenPlayParticipant"("sessionId", "status", "queuePosition");
CREATE INDEX "OpenPlayParticipant_pairId_idx" ON "OpenPlayParticipant"("pairId");
CREATE INDEX "OpenPlayParticipant_userId_idx" ON "OpenPlayParticipant"("userId");
CREATE UNIQUE INDEX "OpenPlayGame_sessionId_sequence_key" ON "OpenPlayGame"("sessionId", "sequence");
CREATE INDEX "OpenPlayGame_sessionId_status_courtId_idx" ON "OpenPlayGame"("sessionId", "status", "courtId");
CREATE INDEX "OpenPlayGame_courtId_createdAt_idx" ON "OpenPlayGame"("courtId", "createdAt");
CREATE UNIQUE INDEX "OpenPlayGamePlayer_gameId_participantId_key" ON "OpenPlayGamePlayer"("gameId", "participantId");
CREATE UNIQUE INDEX "OpenPlayGamePlayer_gameId_slot_key" ON "OpenPlayGamePlayer"("gameId", "slot");
CREATE INDEX "OpenPlayGamePlayer_participantId_idx" ON "OpenPlayGamePlayer"("participantId");

ALTER TABLE "OpenPlaySession" ADD CONSTRAINT "OpenPlaySession_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlaySessionCourt" ADD CONSTRAINT "OpenPlaySessionCourt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OpenPlaySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlaySessionCourt" ADD CONSTRAINT "OpenPlaySessionCourt_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayPair" ADD CONSTRAINT "OpenPlayPair_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OpenPlaySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OpenPlaySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_eventRegistrationId_fkey" FOREIGN KEY ("eventRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_eventGuestSlotId_fkey" FOREIGN KEY ("eventGuestSlotId") REFERENCES "EventGuestSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_organizerGuestId_fkey" FOREIGN KEY ("organizerGuestId") REFERENCES "EventOrganizerGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenPlayParticipant" ADD CONSTRAINT "OpenPlayParticipant_pairId_fkey" FOREIGN KEY ("pairId") REFERENCES "OpenPlayPair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OpenPlayGame" ADD CONSTRAINT "OpenPlayGame_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "OpenPlaySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayGame" ADD CONSTRAINT "OpenPlayGame_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayGamePlayer" ADD CONSTRAINT "OpenPlayGamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "OpenPlayGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayGamePlayer" ADD CONSTRAINT "OpenPlayGamePlayer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "OpenPlayParticipant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
