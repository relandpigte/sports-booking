-- Abandoned holds were never completed bookings. Remove their stale booking
-- rows while keeping BookingPayment as the audit ledger. Financially completed
-- attempts retain their court details as cancelled/refunded history.
UPDATE "Booking" booking
SET
  "status" = 'CANCELLED',
  "holdExpiresAt" = NULL,
  "cancelledAt" = COALESCE(booking."cancelledAt", NOW()),
  "cancelReason" = COALESCE(
    booking."cancelReason",
    'Payment was refunded because the court hold was no longer available.'
  )
FROM "BookingPayment" payment
WHERE booking."bookingPaymentId" = payment."id"
  AND booking."status" = 'EXPIRED'
  AND payment."status" IN ('SUCCEEDED', 'REFUNDED');

DELETE FROM "BookingSlot"
WHERE "bookingId" IN (
  SELECT "id" FROM "Booking" WHERE "status" = 'EXPIRED'
);

DELETE FROM "Booking" WHERE "status" = 'EXPIRED';

ALTER TYPE "BookingStatus" RENAME TO "BookingStatus_old";
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');
ALTER TABLE "Booking" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Booking"
  ALTER COLUMN "status" TYPE "BookingStatus"
  USING ("status"::text::"BookingStatus");
ALTER TABLE "Booking" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
DROP TYPE "BookingStatus_old";

-- Clear legacy event holds from booking surfaces too. Successful/refunded
-- payment attempts remain as cancellations so their financial context stays
-- auditable; unpaid expired registrations and add-on spots are removed.
UPDATE "EventRegistration" registration
SET
  "status" = 'CANCELLED',
  "holdExpiresAt" = NULL,
  "cancelledAt" = COALESCE(registration."cancelledAt", NOW()),
  "cancelReason" = COALESCE(
    registration."cancelReason",
    'Payment was refunded after the registration hold ended.'
  )
FROM "BookingPayment" payment
WHERE registration."bookingPaymentId" = payment."id"
  AND registration."status" = 'EXPIRED'
  AND payment."status" IN ('SUCCEEDED', 'REFUNDED');

UPDATE "EventGuestSlot" guest
SET
  "status" = 'CANCELLED',
  "holdExpiresAt" = NULL,
  "cancelledAt" = COALESCE(guest."cancelledAt", NOW())
FROM "BookingPayment" payment
WHERE guest."bookingPaymentId" = payment."id"
  AND guest."status" = 'EXPIRED'
  AND payment."status" IN ('SUCCEEDED', 'REFUNDED');

DELETE FROM "EventGuestSlot" WHERE "status" = 'EXPIRED';
DELETE FROM "EventRegistration" WHERE "status" = 'EXPIRED';
