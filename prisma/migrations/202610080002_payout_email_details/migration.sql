-- The payout email now carries an admin-written message and reports whether
-- it was delivered. Both columns are nullable and additive: existing payouts
-- simply read as "no message, not emailed".
ALTER TABLE "Payout" ADD COLUMN "recipientMessage" TEXT;
ALTER TABLE "Payout" ADD COLUMN "emailedAt" TIMESTAMP(3);
