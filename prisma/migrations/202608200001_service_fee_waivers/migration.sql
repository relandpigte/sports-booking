-- CreateTable
CREATE TABLE "ServiceFeeWaiver" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
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

    CONSTRAINT "ServiceFeeWaiver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceFeeWaiver_partnerId_grantedAt_idx" ON "ServiceFeeWaiver"("partnerId", "grantedAt");

-- CreateIndex
CREATE INDEX "ServiceFeeWaiver_reversedAt_grantedAt_idx" ON "ServiceFeeWaiver"("reversedAt", "grantedAt");

-- AddForeignKey
ALTER TABLE "ServiceFeeWaiver" ADD CONSTRAINT "ServiceFeeWaiver_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeeWaiver" ADD CONSTRAINT "ServiceFeeWaiver_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceFeeWaiver" ADD CONSTRAINT "ServiceFeeWaiver_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
