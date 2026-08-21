ALTER TABLE "ServiceFeeEntry"
  ALTER COLUMN "bookingPaymentId" DROP NOT NULL,
  ADD COLUMN "eventOrganizerGuestId" TEXT;

ALTER TABLE "ServiceFeeEntry"
  ADD CONSTRAINT "ServiceFeeEntry_exactly_one_source_check"
  CHECK (num_nonnulls("bookingPaymentId", "eventOrganizerGuestId") = 1);

CREATE UNIQUE INDEX "ServiceFeeEntry_eventOrganizerGuestId_type_key"
  ON "ServiceFeeEntry"("eventOrganizerGuestId", "type");

CREATE INDEX "ServiceFeeEntry_eventOrganizerGuestId_idx"
  ON "ServiceFeeEntry"("eventOrganizerGuestId");

ALTER TABLE "ServiceFeeEntry"
  ADD CONSTRAINT "ServiceFeeEntry_eventOrganizerGuestId_fkey"
  FOREIGN KEY ("eventOrganizerGuestId") REFERENCES "EventOrganizerGuest"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
