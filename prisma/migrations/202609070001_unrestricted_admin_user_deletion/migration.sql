-- Shared records retain their operational or financial history after the
-- administrator who acted on them is removed.
ALTER TABLE "TrainerServiceFeeWaiver" ALTER COLUMN "grantedById" DROP NOT NULL;
ALTER TABLE "TrainerServiceFeeWaiver" DROP CONSTRAINT "TrainerServiceFeeWaiver_grantedById_fkey";
ALTER TABLE "TrainerServiceFeeWaiver" ADD CONSTRAINT "TrainerServiceFeeWaiver_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainerServiceFeeWaiver" DROP CONSTRAINT "TrainerServiceFeeWaiver_reversedById_fkey";
ALTER TABLE "TrainerServiceFeeWaiver" ADD CONSTRAINT "TrainerServiceFeeWaiver_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceFeeWaiver" ALTER COLUMN "grantedById" DROP NOT NULL;
ALTER TABLE "ServiceFeeWaiver" DROP CONSTRAINT "ServiceFeeWaiver_grantedById_fkey";
ALTER TABLE "ServiceFeeWaiver" ADD CONSTRAINT "ServiceFeeWaiver_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServiceFeeWaiver" DROP CONSTRAINT "ServiceFeeWaiver_reversedById_fkey";
ALTER TABLE "ServiceFeeWaiver" ADD CONSTRAINT "ServiceFeeWaiver_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerStaffMembership" ALTER COLUMN "invitedById" DROP NOT NULL;
ALTER TABLE "PartnerStaffMembership" DROP CONSTRAINT "PartnerStaffMembership_invitedById_fkey";
ALTER TABLE "PartnerStaffMembership" ADD CONSTRAINT "PartnerStaffMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PartnerStaffInvitation" ALTER COLUMN "invitedById" DROP NOT NULL;
ALTER TABLE "PartnerStaffInvitation" DROP CONSTRAINT "PartnerStaffInvitation_invitedById_fkey";
ALTER TABLE "PartnerStaffInvitation" ADD CONSTRAINT "PartnerStaffInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventOrganizerGuest" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "EventOrganizerGuest" DROP CONSTRAINT "EventOrganizerGuest_createdById_fkey";
ALTER TABLE "EventOrganizerGuest" ADD CONSTRAINT "EventOrganizerGuest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- These actor ids are deliberately scalar audit fields. The deletion
-- transaction clears them, so they must accept null without becoming User
-- relations that could delete shared history.
ALTER TABLE "PartnerImpersonationAudit" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "PartnerImpersonationAudit" ALTER COLUMN "partnerId" DROP NOT NULL;
ALTER TABLE "CourtBlock" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "OpenPlayQueue" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "OpenPlaySession" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "OpenPlayGame" ALTER COLUMN "createdById" DROP NOT NULL;
