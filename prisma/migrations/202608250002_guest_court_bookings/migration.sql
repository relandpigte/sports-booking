-- Anonymous court checkout keeps contact details in a reservation aggregate
-- rather than creating shadow User accounts.
CREATE TABLE "GuestReservation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestReservationAccessToken" (
    "id" TEXT NOT NULL,
    "guestReservationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuestReservationAccessToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BookingPayment"
    ALTER COLUMN "userId" DROP NOT NULL,
    ADD COLUMN "guestReservationId" TEXT;

ALTER TABLE "Booking"
    ALTER COLUMN "userId" DROP NOT NULL,
    ADD COLUMN "guestReservationId" TEXT;

CREATE INDEX "GuestReservation_email_createdAt_idx"
    ON "GuestReservation"("email", "createdAt");
CREATE INDEX "GuestReservation_accessExpiresAt_idx"
    ON "GuestReservation"("accessExpiresAt");
CREATE UNIQUE INDEX "GuestReservationAccessToken_tokenHash_key"
    ON "GuestReservationAccessToken"("tokenHash");
CREATE INDEX "GuestReservationAccessToken_guestReservationId_expiresAt_idx"
    ON "GuestReservationAccessToken"("guestReservationId", "expiresAt");
CREATE INDEX "GuestReservationAccessToken_expiresAt_idx"
    ON "GuestReservationAccessToken"("expiresAt");
CREATE UNIQUE INDEX "BookingPayment_guestReservationId_key"
    ON "BookingPayment"("guestReservationId");
CREATE INDEX "BookingPayment_guestReservationId_createdAt_idx"
    ON "BookingPayment"("guestReservationId", "createdAt");
CREATE INDEX "Booking_guestReservationId_startsAt_idx"
    ON "Booking"("guestReservationId", "startsAt");

ALTER TABLE "BookingPayment"
    ADD CONSTRAINT "BookingPayment_guestReservationId_fkey"
    FOREIGN KEY ("guestReservationId") REFERENCES "GuestReservation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GuestReservationAccessToken"
    ADD CONSTRAINT "GuestReservationAccessToken_guestReservationId_fkey"
    FOREIGN KEY ("guestReservationId") REFERENCES "GuestReservation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_guestReservationId_fkey"
    FOREIGN KEY ("guestReservationId") REFERENCES "GuestReservation"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A booking or payment is owned by either a real player or a guest cart,
-- never both and never neither.
ALTER TABLE "BookingPayment"
    ADD CONSTRAINT "BookingPayment_owner_check"
    CHECK (("userId" IS NOT NULL) <> ("guestReservationId" IS NOT NULL));

ALTER TABLE "Booking"
    ADD CONSTRAINT "Booking_owner_check"
    CHECK (("userId" IS NOT NULL) <> ("guestReservationId" IS NOT NULL));
