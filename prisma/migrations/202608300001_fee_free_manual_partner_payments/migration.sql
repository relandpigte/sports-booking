-- Manual venue and event payments now charge only the advertised amount.
-- Preserve submitted or completed payments because their receipts and ledger
-- values snapshot the policy accepted at the time of transfer.
UPDATE "BookingPayment"
SET
  "amount" = "venueAmount",
  "platformFee" = 0
WHERE
  "collectionMode" = 'MANUAL'
  AND "status" = 'PENDING'
  AND "manualSubmittedAt" IS NULL;
