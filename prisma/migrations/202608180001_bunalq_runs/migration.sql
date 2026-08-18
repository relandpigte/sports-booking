CREATE TYPE "OpenPlayQueueKind" AS ENUM ('EVENT', 'QUICK');
CREATE TYPE "OpenPlayAdmissionMode" AS ENUM ('APPROVAL_REQUIRED', 'INSTANT');

ALTER TYPE "OpenPlayParticipantSource" ADD VALUE IF NOT EXISTS 'PUBLIC_GUEST';
ALTER TYPE "OpenPlayParticipantStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL' BEFORE 'NOT_CHECKED_IN';
ALTER TYPE "OpenPlayParticipantStatus" ADD VALUE IF NOT EXISTS 'REMOVED';

CREATE TABLE "OpenPlayQueue" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "hubId" TEXT NOT NULL,
  "eventId" TEXT,
  "title" VARCHAR(120) NOT NULL,
  "kind" "OpenPlayQueueKind" NOT NULL,
  "admissionMode" "OpenPlayAdmissionMode" NOT NULL DEFAULT 'APPROVAL_REQUIRED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OpenPlayQueue_pkey" PRIMARY KEY ("id")
);

INSERT INTO "OpenPlayQueue" (
  "id", "publicId", "hubId", "eventId", "title", "kind", "admissionMode",
  "createdById", "createdAt", "updatedAt"
)
SELECT
  'queue_' || session."id",
  session."id",
  event."hubId",
  event."id",
  event."title",
  'EVENT'::"OpenPlayQueueKind",
  'APPROVAL_REQUIRED'::"OpenPlayAdmissionMode",
  session."createdById",
  session."createdAt",
  session."updatedAt"
FROM "OpenPlaySession" AS session
JOIN "Event" AS event ON event."id" = session."eventId";

ALTER TABLE "OpenPlaySession" ADD COLUMN "queueId" TEXT;
ALTER TABLE "OpenPlaySession" ADD COLUMN "runNumber" INTEGER NOT NULL DEFAULT 1;

UPDATE "OpenPlaySession"
SET "queueId" = 'queue_' || "id";

ALTER TABLE "OpenPlaySession" ALTER COLUMN "queueId" SET NOT NULL;

ALTER TABLE "OpenPlaySession" DROP CONSTRAINT "OpenPlaySession_eventId_fkey";
DROP INDEX "OpenPlaySession_eventId_key";
ALTER TABLE "OpenPlaySession" DROP COLUMN "eventId";

CREATE UNIQUE INDEX "OpenPlayQueue_publicId_key" ON "OpenPlayQueue"("publicId");
CREATE UNIQUE INDEX "OpenPlayQueue_eventId_key" ON "OpenPlayQueue"("eventId");
CREATE INDEX "OpenPlayQueue_hubId_updatedAt_idx" ON "OpenPlayQueue"("hubId", "updatedAt");
CREATE INDEX "OpenPlayQueue_kind_updatedAt_idx" ON "OpenPlayQueue"("kind", "updatedAt");
CREATE UNIQUE INDEX "OpenPlaySession_queueId_runNumber_key" ON "OpenPlaySession"("queueId", "runNumber");
CREATE INDEX "OpenPlaySession_queueId_status_updatedAt_idx" ON "OpenPlaySession"("queueId", "status", "updatedAt");

ALTER TABLE "OpenPlayQueue" ADD CONSTRAINT "OpenPlayQueue_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlayQueue" ADD CONSTRAINT "OpenPlayQueue_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpenPlaySession" ADD CONSTRAINT "OpenPlaySession_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "OpenPlayQueue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
