CREATE TYPE "StaffAccessLevel" AS ENUM ('NONE', 'VIEW', 'MANAGE');

CREATE TABLE "PartnerStaffMembership" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "hubs" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "bookings" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "events" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "reports" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "messages" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "payments" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerStaffMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerStaffInvitation" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "hubs" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "bookings" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "events" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "reports" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "messages" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "payments" "StaffAccessLevel" NOT NULL DEFAULT 'NONE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerStaffInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerStaffActivity" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" VARCHAR(80) NOT NULL,
  "targetType" VARCHAR(80),
  "targetId" VARCHAR(120),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerStaffActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerStaffMembership_userId_key" ON "PartnerStaffMembership"("userId");
CREATE UNIQUE INDEX "PartnerStaffMembership_partnerId_userId_key" ON "PartnerStaffMembership"("partnerId", "userId");
CREATE INDEX "PartnerStaffMembership_partnerId_createdAt_idx" ON "PartnerStaffMembership"("partnerId", "createdAt");
CREATE UNIQUE INDEX "PartnerStaffInvitation_email_key" ON "PartnerStaffInvitation"("email");
CREATE UNIQUE INDEX "PartnerStaffInvitation_tokenHash_key" ON "PartnerStaffInvitation"("tokenHash");
CREATE INDEX "PartnerStaffInvitation_partnerId_createdAt_idx" ON "PartnerStaffInvitation"("partnerId", "createdAt");
CREATE INDEX "PartnerStaffInvitation_expiresAt_idx" ON "PartnerStaffInvitation"("expiresAt");
CREATE INDEX "PartnerStaffActivity_partnerId_createdAt_idx" ON "PartnerStaffActivity"("partnerId", "createdAt");
CREATE INDEX "PartnerStaffActivity_actorId_createdAt_idx" ON "PartnerStaffActivity"("actorId", "createdAt");

ALTER TABLE "PartnerStaffMembership" ADD CONSTRAINT "PartnerStaffMembership_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerStaffMembership" ADD CONSTRAINT "PartnerStaffMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerStaffMembership" ADD CONSTRAINT "PartnerStaffMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerStaffInvitation" ADD CONSTRAINT "PartnerStaffInvitation_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerStaffInvitation" ADD CONSTRAINT "PartnerStaffInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PartnerStaffActivity" ADD CONSTRAINT "PartnerStaffActivity_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerStaffActivity" ADD CONSTRAINT "PartnerStaffActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
