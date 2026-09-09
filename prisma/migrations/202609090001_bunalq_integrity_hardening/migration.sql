ALTER TABLE "OpenPlaySession"
ADD COLUMN "liveRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OpenPlayParticipant"
ADD COLUMN "detailsOverridden" BOOLEAN NOT NULL DEFAULT false;

-- Preserve queue and match history when an individual court is removed. The
-- explicit hub-deletion action deletes its BunalQ rooms first.
ALTER TABLE "OpenPlaySessionCourt"
DROP CONSTRAINT "OpenPlaySessionCourt_courtId_fkey";

ALTER TABLE "OpenPlaySessionCourt"
ADD CONSTRAINT "OpenPlaySessionCourt_courtId_fkey"
FOREIGN KEY ("courtId") REFERENCES "Court"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OpenPlayGame"
DROP CONSTRAINT "OpenPlayGame_courtId_fkey";

ALTER TABLE "OpenPlayGame"
ADD CONSTRAINT "OpenPlayGame_courtId_fkey"
FOREIGN KEY ("courtId") REFERENCES "Court"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OpenPlayParticipant"
ADD CONSTRAINT "OpenPlayParticipant_queue_position_matches_status"
CHECK (
  ("status" = 'QUEUED' AND "queuePosition" IS NOT NULL)
  OR
  ("status" <> 'QUEUED' AND "queuePosition" IS NULL)
) NOT VALID;

ALTER TABLE "OpenPlayGame"
ADD CONSTRAINT "OpenPlayGame_winning_team_valid"
CHECK ("winningTeam" IS NULL OR "winningTeam" IN (1, 2)) NOT VALID;

ALTER TABLE "OpenPlayGamePlayer"
ADD CONSTRAINT "OpenPlayGamePlayer_team_valid"
CHECK ("team" IN (1, 2)) NOT VALID;

ALTER TABLE "OpenPlayGamePlayer"
ADD CONSTRAINT "OpenPlayGamePlayer_slot_valid"
CHECK ("slot" BETWEEN 1 AND 4) NOT VALID;
