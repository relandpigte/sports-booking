-- AlterTable
ALTER TABLE "OpenPlayParticipant" ADD COLUMN     "duprRating" DECIMAL(4,3);

-- CreateTable
CREATE TABLE "DuprLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "duprId" VARCHAR(12) NOT NULL,
    "fullName" VARCHAR(160) NOT NULL,
    "singles" DECIMAL(4,3),
    "doubles" DECIMAL(4,3),
    "singlesReliable" BOOLEAN NOT NULL DEFAULT false,
    "doublesReliable" BOOLEAN NOT NULL DEFAULT false,
    "consentLostAt" TIMESTAMP(3),
    "ratingsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DuprLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DuprLink_userId_key" ON "DuprLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DuprLink_duprId_key" ON "DuprLink"("duprId");

-- CreateIndex
CREATE INDEX "DuprLink_ratingsUpdatedAt_idx" ON "DuprLink"("ratingsUpdatedAt");

-- AddForeignKey
ALTER TABLE "DuprLink" ADD CONSTRAINT "DuprLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

