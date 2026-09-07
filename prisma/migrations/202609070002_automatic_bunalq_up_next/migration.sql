-- Upcoming BunalQ games are prepared before a destination court is known.
ALTER TABLE "OpenPlayGame" ALTER COLUMN "courtId" DROP NOT NULL;

-- Once play begins, every game must still belong to a court. Cancelled
-- upcoming games may remain courtless for immutable run history.
ALTER TABLE "OpenPlayGame"
ADD CONSTRAINT "OpenPlayGame_active_requires_court"
CHECK ("status" NOT IN ('ACTIVE', 'COMPLETED') OR "courtId" IS NOT NULL);

-- Session locking already serializes dispatch, while this partial unique
-- index makes the one-live-game-per-court invariant explicit in PostgreSQL.
CREATE UNIQUE INDEX "OpenPlayGame_one_active_per_court"
ON "OpenPlayGame"("sessionId", "courtId")
WHERE "status" = 'ACTIVE';
