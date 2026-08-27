-- Event registrations may be owned by a signed-in player or an anonymous
-- guest reservation, mirroring court-booking payment ownership.
ALTER TABLE "EventRegistration"
    ALTER COLUMN "userId" DROP NOT NULL,
    ADD COLUMN "guestReservationId" TEXT;

CREATE UNIQUE INDEX "EventRegistration_guestReservationId_key"
    ON "EventRegistration"("guestReservationId");
CREATE INDEX "EventRegistration_guestReservationId_createdAt_idx"
    ON "EventRegistration"("guestReservationId", "createdAt");

ALTER TABLE "EventRegistration"
    ADD CONSTRAINT "EventRegistration_guestReservationId_fkey"
    FOREIGN KEY ("guestReservationId") REFERENCES "GuestReservation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventRegistration"
    ADD CONSTRAINT "EventRegistration_owner_check"
    CHECK (("userId" IS NOT NULL) <> ("guestReservationId" IS NOT NULL));
