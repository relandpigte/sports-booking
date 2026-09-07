-- A court can hold one upcoming or live BunalQ match, never both.
DROP INDEX IF EXISTS "OpenPlayGame_one_active_per_court";

CREATE UNIQUE INDEX "OpenPlayGame_one_open_per_court"
ON "OpenPlayGame"("sessionId", "courtId")
WHERE "status" IN ('STAGED', 'ACTIVE');
