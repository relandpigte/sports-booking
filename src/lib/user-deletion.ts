import "server-only";

import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function deleteUserData(
  tx: Tx,
  target: {
    id: string;
    email: string;
    partnerGatewayId: string | null;
    deleteVenueTransactions: boolean;
  }
): Promise<void> {
  const now = new Date();
  const sessionIds = (
    await tx.partnerImpersonationSession.findMany({
      where: {
        OR: [{ adminId: target.id }, { partnerId: target.id }],
      },
      select: { id: true },
    })
  ).map((session) => session.id);

  if (target.partnerGatewayId) {
    await tx.providerEvent.deleteMany({
      where: { provider: `venue:${target.partnerGatewayId}` },
    });
  }

  // A partner-owned service-fee entry can also reference an organizer guest
  // with RESTRICT semantics. Remove the ledger side first so both branches of
  // the partner's ownership graph can cascade safely.
  await tx.serviceFeeEntry.deleteMany({ where: { partnerId: target.id } });

  if (target.deleteVenueTransactions) {
    // This is an explicit admin escape hatch for disposable test data. Remove
    // the reservation branches first, then the payment aggregate and its
    // cascading service-fee entries so venue reports no longer count it.
    await tx.booking.deleteMany({ where: { userId: target.id } });
    await tx.eventRegistration.deleteMany({ where: { userId: target.id } });
    await tx.bookingPayment.deleteMany({ where: { userId: target.id } });
  }

  // Preserve shared conversations and match history, but remove authored
  // content and copied identity from the account being erased.
  await tx.chatReport.updateMany({
    where: { message: { senderId: target.id } },
    data: { evidenceBody: null },
  });
  await tx.chatReport.updateMany({
    where: { reporterId: target.id },
    data: { details: null, evidenceBody: null },
  });
  await tx.chatReport.updateMany({
    where: { reviewerId: target.id },
    data: { reviewerId: null, resolution: null },
  });
  await tx.chatMessage.updateMany({
    where: { senderId: target.id },
    data: {
      body: null,
      targetPath: null,
      deletedAt: now,
    },
  });
  await tx.chatMessage.updateMany({
    where: { deletedById: target.id },
    data: { deletedById: null },
  });
  await tx.openPlaySession.updateMany({
    where: {
      status: { not: "ENDED" },
      participants: { some: { userId: target.id } },
    },
    data: { liveRevision: { increment: 1 } },
  });
  await tx.openPlayParticipant.updateMany({
    where: { userId: target.id },
    data: { displayName: "Deleted player" },
  });

  // Remove user ids stored as scalar audit facts. Relational attribution uses
  // SET NULL in the schema and is cleared by the final User deletion.
  await tx.user.updateMany({
    where: { partnerActivatedById: target.id },
    data: { partnerActivatedById: null },
  });
  await tx.user.updateMany({
    where: { chatRestrictedById: target.id },
    data: { chatRestrictedById: null },
  });
  await tx.trainerProfile.updateMany({
    where: { activatedById: target.id },
    data: { activatedById: null },
  });
  await tx.trainerProfile.updateMany({
    where: { facebookReviewedById: target.id },
    data: { facebookReviewedById: null },
  });
  await tx.trainerSession.updateMany({
    where: { rescheduledById: target.id },
    data: { rescheduledById: null },
  });
  await tx.trainerPayment.updateMany({
    where: { manualReviewedById: target.id },
    data: { manualReviewedById: null },
  });
  await tx.trainerPayment.updateMany({
    where: { refundedById: target.id },
    data: { refundedById: null },
  });
  await tx.trainerPayment.updateMany({
    where: { refundRequestedById: target.id },
    data: { refundRequestedById: null },
  });
  await tx.trainerServiceFeeSettlement.updateMany({
    where: { reviewedById: target.id },
    data: { reviewedById: null },
  });
  await tx.bookingPayment.updateMany({
    where: { manualReviewedById: target.id },
    data: { manualReviewedById: null },
  });
  await tx.bookingPayment.updateMany({
    where: { refundedById: target.id },
    data: { refundedById: null },
  });
  await tx.serviceFeeSettlement.updateMany({
    where: { reviewedById: target.id },
    data: { reviewedById: null },
  });
  await tx.platformGateway.updateMany({
    where: { connectedById: target.id },
    data: { connectedById: null },
  });
  await tx.courtBlock.updateMany({
    where: { createdById: target.id },
    data: { createdById: null },
  });
  await tx.courtBlock.updateMany({
    where: { releasedById: target.id },
    data: { releasedById: null },
  });
  await tx.openPlayQueue.updateMany({
    where: { createdById: target.id },
    data: { createdById: null },
  });
  await tx.openPlaySession.updateMany({
    where: { createdById: target.id },
    data: { createdById: null },
  });
  await tx.openPlayGame.updateMany({
    where: { createdById: target.id },
    data: { createdById: null },
  });
  await tx.partnerStaffActivity.updateMany({
    where: { targetId: target.id },
    data: { targetId: null },
  });

  if (sessionIds.length > 0) {
    await tx.partnerImpersonationAudit.updateMany({
      where: { sessionId: { in: sessionIds } },
      data: { sessionId: null },
    });
  }
  await tx.partnerImpersonationAudit.updateMany({
    where: { adminId: target.id },
    data: { adminId: null },
  });
  await tx.partnerImpersonationAudit.updateMany({
    where: { partnerId: target.id },
    data: { partnerId: null },
  });
  await tx.partnerImpersonationAudit.updateMany({
    where: { targetId: target.id },
    data: { targetId: null },
  });
  await tx.partnerImpersonationSession.deleteMany({
    where: {
      OR: [{ adminId: target.id }, { partnerId: target.id }],
    },
  });

  await tx.partnerStaffInvitation.deleteMany({
    where: { email: { equals: target.email, mode: "insensitive" } },
  });
  await tx.verificationToken.deleteMany({
    where: { identifier: { equals: target.email, mode: "insensitive" } },
  });
  await tx.$executeRaw(
    Prisma.sql`
      UPDATE "PartnerStaffActivity"
      SET "metadata" = "metadata" - 'email'
      WHERE LOWER("metadata"->>'email') = LOWER(${target.email})
    `
  );

  await tx.user.delete({ where: { id: target.id } });
}
