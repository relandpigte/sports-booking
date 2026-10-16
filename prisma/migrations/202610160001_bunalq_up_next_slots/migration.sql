-- AlterTable
-- Organizers now choose how many Up next matches a run keeps prepared. New
-- runs start with one per court; existing runs keep the previous fixed two.
ALTER TABLE "OpenPlaySession" ADD COLUMN "upNextSlots" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "OpenPlaySession"
  ADD CONSTRAINT "OpenPlaySession_up_next_slots_range"
  CHECK ("upNextSlots" BETWEEN 1 AND 12);
