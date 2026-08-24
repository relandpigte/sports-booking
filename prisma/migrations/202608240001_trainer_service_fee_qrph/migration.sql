ALTER TABLE "TrainerServiceFeeSettlement"
ADD COLUMN "provider" TEXT,
ADD COLUMN "providerPaymentId" TEXT,
ADD COLUMN "providerRef" TEXT,
ADD COLUMN "redirectUrl" TEXT,
ADD COLUMN "raw" JSONB;

CREATE UNIQUE INDEX "TrainerServiceFeeSettlement_providerPaymentId_key"
ON "TrainerServiceFeeSettlement"("providerPaymentId");
