ALTER TABLE "User"
ADD COLUMN "isGuestBunalQOrganizer" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Hub"
ADD COLUMN "guestBunalQOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "OpenPlayQueue"
ADD COLUMN "directoryListed" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "GuestBunalQOrganizerSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestBunalQOrganizerSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuestBunalQOrganizerSession_userId_key"
ON "GuestBunalQOrganizerSession"("userId");

CREATE UNIQUE INDEX "GuestBunalQOrganizerSession_tokenHash_key"
ON "GuestBunalQOrganizerSession"("tokenHash");

CREATE INDEX "GuestBunalQOrganizerSession_expiresAt_idx"
ON "GuestBunalQOrganizerSession"("expiresAt");

ALTER TABLE "GuestBunalQOrganizerSession"
ADD CONSTRAINT "GuestBunalQOrganizerSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpenPlayQueue"
ADD CONSTRAINT "OpenPlayQueue_guest_directory_guard"
CHECK ("directoryListed" OR "kind" = 'QUICK');
