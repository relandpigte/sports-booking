-- CreateTable
CREATE TABLE "TrainerServiceFeeWaiver" (
    "id" TEXT NOT NULL,
    "trainerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "balanceBefore" DECIMAL(10,2) NOT NULL,
    "balanceAfter" DECIMAL(10,2) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "reversalBalanceBefore" DECIMAL(10,2),
    "reversalBalanceAfter" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainerServiceFeeWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrainerServiceFeeWaiver_trainerId_grantedAt_idx" ON "TrainerServiceFeeWaiver"("trainerId", "grantedAt");

-- CreateIndex
CREATE INDEX "TrainerServiceFeeWaiver_reversedAt_grantedAt_idx" ON "TrainerServiceFeeWaiver"("reversedAt", "grantedAt");

-- AddForeignKey
ALTER TABLE "TrainerServiceFeeWaiver" ADD CONSTRAINT "TrainerServiceFeeWaiver_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerServiceFeeWaiver" ADD CONSTRAINT "TrainerServiceFeeWaiver_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerServiceFeeWaiver" ADD CONSTRAINT "TrainerServiceFeeWaiver_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
