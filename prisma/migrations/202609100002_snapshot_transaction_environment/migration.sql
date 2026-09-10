CREATE TYPE "TransactionEnvironment" AS ENUM ('TEST', 'LIVE', 'UNKNOWN');

ALTER TABLE "BookingPayment"
ADD COLUMN "environment" "TransactionEnvironment" NOT NULL DEFAULT 'UNKNOWN';

-- Existing automatic payments can be classified from the gateway key that is
-- still stored with them. Manual and ambiguous legacy rows stay UNKNOWN.
UPDATE "BookingPayment" AS payment
SET "environment" = CASE
  WHEN gateway."publicKey" LIKE 'pk_test_%' THEN 'TEST'::"TransactionEnvironment"
  WHEN gateway."publicKey" LIKE 'pk_live_%' THEN 'LIVE'::"TransactionEnvironment"
  ELSE 'UNKNOWN'::"TransactionEnvironment"
END
FROM "PartnerGateway" AS gateway
WHERE payment."gatewayId" = gateway."id"
  AND payment."collectionMode" = 'AUTOMATIC';

CREATE INDEX "BookingPayment_environment_createdAt_idx"
ON "BookingPayment"("environment", "createdAt");
