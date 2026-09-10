-- Deleting a player anonymizes venue financial history instead of
-- erasing money that the venue has already received. Partner ownership still
-- cascades, so removing a venue account continues to remove its owned graph.
ALTER TABLE "BookingPayment"
DROP CONSTRAINT "BookingPayment_userId_fkey";

ALTER TABLE "BookingPayment"
ADD CONSTRAINT "BookingPayment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Booking"
DROP CONSTRAINT "Booking_userId_fkey";

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventRegistration"
DROP CONSTRAINT "EventRegistration_userId_fkey";

ALTER TABLE "EventRegistration"
ADD CONSTRAINT "EventRegistration_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Creation paths still require exactly one owner. Permanent deletion is the
-- sole lifecycle transition that may leave an anonymized row with neither.
ALTER TABLE "BookingPayment"
DROP CONSTRAINT "BookingPayment_owner_check";

ALTER TABLE "BookingPayment"
ADD CONSTRAINT "BookingPayment_owner_check"
CHECK (num_nonnulls("userId", "guestReservationId") <= 1);

ALTER TABLE "Booking"
DROP CONSTRAINT "Booking_owner_check";

ALTER TABLE "Booking"
ADD CONSTRAINT "Booking_owner_check"
CHECK (num_nonnulls("userId", "guestReservationId") <= 1);

ALTER TABLE "EventRegistration"
DROP CONSTRAINT "EventRegistration_owner_check";

ALTER TABLE "EventRegistration"
ADD CONSTRAINT "EventRegistration_owner_check"
CHECK (num_nonnulls("userId", "guestReservationId") <= 1);
