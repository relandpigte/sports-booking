-- Tighten the trainer checkout snapshot invariant now that both the session
-- and payment rows persist all three components independently.
ALTER TABLE "TrainerSession"
  DROP CONSTRAINT "TrainerSession_valid_date_hours_amounts";

ALTER TABLE "TrainerSession"
  ADD CONSTRAINT "TrainerSession_valid_date_hours_amounts" CHECK (
    "date" ~ '^\d{4}-\d{2}-\d{2}$' AND
    "startHour" BETWEEN 0 AND 23 AND
    "endHour" BETWEEN 1 AND 24 AND
    "hours" = "endHour" - "startHour" AND
    "hours" > 0 AND
    "hourlyRate" > 0 AND
    "trainerAmount" >= 0 AND
    "platformFee" >= 0 AND
    "processingFee" >= 0 AND
    "totalAmount" = "trainerAmount" + "platformFee" + "processingFee"
  );

ALTER TABLE "TrainerPayment"
  DROP CONSTRAINT "TrainerPayment_nonnegative_amounts";

ALTER TABLE "TrainerPayment"
  ADD CONSTRAINT "TrainerPayment_nonnegative_amounts" CHECK (
    "amount" >= 0 AND "trainerAmount" >= 0 AND
    "platformFee" >= 0 AND "processingFee" >= 0 AND
    "amount" = "trainerAmount" + "platformFee" + "processingFee" AND
    ("refundedAmount" IS NULL OR "refundedAmount" >= 0)
  );
