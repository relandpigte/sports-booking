-- A venue or trainer may attach the receive QR for their payout account, so
-- the admin can scan it instead of typing the number. Nullable and additive:
-- existing accounts simply have no QR.
ALTER TABLE "PayoutAccount" ADD COLUMN "qrImage" TEXT;
