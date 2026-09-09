-- Individual court deletion must not erase BunalQ history. Deferring these
-- NO ACTION checks until commit also lets an intentional Hub/User cascade
-- remove both the venue courts and their BunalQ rooms in one transaction.
ALTER TABLE "OpenPlaySessionCourt"
DROP CONSTRAINT "OpenPlaySessionCourt_courtId_fkey";

ALTER TABLE "OpenPlaySessionCourt"
ADD CONSTRAINT "OpenPlaySessionCourt_courtId_fkey"
FOREIGN KEY ("courtId") REFERENCES "Court"("id")
ON DELETE NO ACTION ON UPDATE CASCADE
DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "OpenPlayGame"
DROP CONSTRAINT "OpenPlayGame_courtId_fkey";

ALTER TABLE "OpenPlayGame"
ADD CONSTRAINT "OpenPlayGame_courtId_fkey"
FOREIGN KEY ("courtId") REFERENCES "Court"("id")
ON DELETE NO ACTION ON UPDATE CASCADE
DEFERRABLE INITIALLY DEFERRED;
