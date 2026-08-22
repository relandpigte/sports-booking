-- Trainer sessions are in-person only. Private location instructions remain
-- on the profile and existing sessions, schedules, and payments are unchanged.
DROP INDEX IF EXISTS "TrainerProfile_sessionMode_area_idx";

ALTER TABLE "TrainerProfile" DROP COLUMN "sessionMode";

DROP TYPE "TrainerSessionMode";

CREATE INDEX "TrainerProfile_area_idx" ON "TrainerProfile"("area");
