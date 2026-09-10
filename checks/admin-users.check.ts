// Admin user management: compact server pagination and role/search filters.
//
//   npm run check:admin-users
import { PrismaClient } from "@prisma/client";

import { deleteFixtureUsers, ok, run, stubRequestContext } from "./harness";

const prisma = new PrismaClient();
const EMAIL_PREFIX = "check-admin-page-";
const ADMIN_EMAIL = `${EMAIL_PREFIX}admin@example.test`;

async function cleanup() {
  await prisma.verificationToken.deleteMany({
    where: { identifier: { startsWith: EMAIL_PREFIX, mode: "insensitive" } },
  });
  await prisma.providerEvent.deleteMany({
    where: { eventId: { startsWith: EMAIL_PREFIX } },
  });
  await prisma.partnerImpersonationAudit.deleteMany({
    where: { action: { startsWith: EMAIL_PREFIX } },
  });
  await prisma.partnerImpersonationSession.deleteMany({
    where: { tokenHash: { startsWith: EMAIL_PREFIX } },
  });
  await deleteFixtureUsers(prisma, {
    email: { startsWith: EMAIL_PREFIX },
  });
}

function deletionForm(
  userId: string,
  email: string,
  deleteVenueTransactions = false
) {
  const formData = new FormData();
  formData.set("userId", userId);
  formData.set("confirmationEmail", email);
  if (deleteVenueTransactions) {
    formData.set("deleteVenueTransactions", "on");
  }
  return formData;
}

async function check() {
  await cleanup();
  const admin = await prisma.user.create({
    data: {
      name: "Pagination Admin",
      email: ADMIN_EMAIL,
      role: "ADMIN",
    },
    select: { id: true, email: true, role: true },
  });
  await prisma.user.createMany({
    data: Array.from({ length: 23 }, (_, index) => ({
      name: `Pagination Player ${String(index + 1).padStart(2, "0")}`,
      email: `${EMAIL_PREFIX}${index + 1}@example.test`,
      role: "PLAYER" as const,
    })),
  });
  const trainerUser = await prisma.user.findUniqueOrThrow({
    where: { email: `${EMAIL_PREFIX}1@example.test` },
    select: { id: true },
  });
  await prisma.trainerProfile.create({
    data: {
      userId: trainerUser.id,
      status: "PENDING",
      sports: ["pickleball"],
      specialties: ["beginner coaching"],
    },
  });

  stubRequestContext(admin, { stubAdminModule: false });
  const { ADMIN_USERS_PAGE_SIZE, listUsers } = await import("@/lib/admin");
  const firstPage = await listUsers({ query: EMAIL_PREFIX, page: 1 });
  ok(
    "the first user page is capped at twenty rows",
    ADMIN_USERS_PAGE_SIZE === 20 &&
      firstPage.total === 24 &&
      firstPage.items.length === 20 &&
      firstPage.pageCount === 2
  );
  const secondPage = await listUsers({ query: EMAIL_PREFIX, page: 2 });
  ok(
    "the second page contains the remaining users",
    secondPage.page === 2 && secondPage.items.length === 4
  );
  const clamped = await listUsers({ query: EMAIL_PREFIX, page: 99 });
  ok("out-of-range pages clamp to the final page", clamped.page === 2);
  const players = await listUsers({
    query: EMAIL_PREFIX,
    role: "PLAYER",
    page: 1,
  });
  ok(
    "role filters are applied before pagination",
    players.total === 23 && players.items.every((user) => user.role === "PLAYER")
  );
  const trainers = await listUsers({
    query: EMAIL_PREFIX,
    trainerOnly: true,
    trainerStatus: "PENDING",
    page: 1,
  });
  ok(
    "trainer capability and status filters are exposed in user management",
    trainers.total === 1 &&
      trainers.items[0]?.trainerStatus === "PENDING" &&
      trainers.items[0]?.role === "PLAYER"
  );
  const searched = await listUsers({ query: "Pagination Admin", page: 1 });
  ok(
    "name search is applied on the server",
    searched.total === 1 && searched.items[0]?.email === ADMIN_EMAIL
  );

  const emptyPartnerEmail = `${EMAIL_PREFIX}empty-partner@example.test`;
  const emptyPartner = await prisma.user.create({
    data: {
      name: "Empty Partner",
      email: emptyPartnerEmail,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true },
  });
  const establishedPartnerEmail = `${EMAIL_PREFIX}established-partner@example.test`;
  const establishedPartner = await prisma.user.create({
    data: {
      name: "Established Partner",
      email: establishedPartnerEmail,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      hubs: {
        create: {
          name: "Protected Venue",
          coverPhotos: [],
          games: ["pickleball"],
          courts: { create: { name: "Protected Court" } },
        },
      },
    },
    select: {
      id: true,
      hubs: { select: { id: true, courts: { select: { id: true } } } },
    },
  });
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: establishedPartner.id,
      provider: "paymongo",
      publicKey: "pk_test_admin_delete",
      secretKeyEnc: "encrypted",
      webhookSecretEnc: "encrypted",
      secretKeyHint: "lete",
      webhookToken: `${EMAIL_PREFIX}gateway-token`,
    },
    select: { id: true },
  });
  const providerEventId = `${EMAIL_PREFIX}venue-webhook`;
  await prisma.providerEvent.create({
    data: {
      provider: `venue:${gateway.id}`,
      eventId: providerEventId,
      type: "payment.paid",
      payload: {},
    },
  });
  const paidPlayerEmail = `${EMAIL_PREFIX}paid-player@example.test`;
  const paidPlayer = await prisma.user.create({
    data: {
      name: "Paid Player",
      email: paidPlayerEmail,
      role: "PLAYER",
    },
    select: { id: true },
  });
  const paidPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: establishedPartner.id,
      gatewayId: gateway.id,
      userId: paidPlayer.id,
      hubId: establishedPartner.hubs[0].id,
      amount: 525,
      venueAmount: 500,
      platformFee: 25,
      method: "QRPH",
      status: "SUCCEEDED",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      provider: "paymongo",
      paidAt: new Date("2098-12-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const paidBooking = await prisma.booking.create({
    data: {
      courtId: establishedPartner.hubs[0].courts[0].id,
      hubId: establishedPartner.hubs[0].id,
      userId: paidPlayer.id,
      date: "2099-01-01",
      startHour: 8,
      endHour: 9,
      hours: 1,
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-01-01T01:00:00.000Z"),
      hourlyRate: 500,
      totalPrice: 525,
      bookingPaymentId: paidPayment.id,
    },
    select: { id: true },
  });
  const paidFeeEntry = await prisma.serviceFeeEntry.create({
    data: {
      partnerId: establishedPartner.id,
      bookingPaymentId: paidPayment.id,
      type: "CHARGE",
      amount: 25,
    },
    select: { id: true },
  });
  const purgedPlayerEmail = `${EMAIL_PREFIX}purged-player@example.test`;
  const purgedPlayer = await prisma.user.create({
    data: {
      name: "Test Transaction Player",
      email: purgedPlayerEmail,
      role: "PLAYER",
    },
    select: { id: true },
  });
  const purgedPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: establishedPartner.id,
      gatewayId: gateway.id,
      userId: purgedPlayer.id,
      hubId: establishedPartner.hubs[0].id,
      amount: 525,
      venueAmount: 500,
      platformFee: 25,
      method: "QRPH",
      status: "SUCCEEDED",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
      provider: "paymongo",
      paidAt: new Date("2098-12-01T01:00:00.000Z"),
    },
    select: { id: true },
  });
  const purgedBooking = await prisma.booking.create({
    data: {
      courtId: establishedPartner.hubs[0].courts[0].id,
      hubId: establishedPartner.hubs[0].id,
      userId: purgedPlayer.id,
      date: "2099-01-01",
      startHour: 9,
      endHour: 10,
      hours: 1,
      startsAt: new Date("2099-01-01T01:00:00.000Z"),
      endsAt: new Date("2099-01-01T02:00:00.000Z"),
      hourlyRate: 500,
      totalPrice: 525,
      bookingPaymentId: purgedPayment.id,
    },
    select: { id: true },
  });
  const purgedFeeEntry = await prisma.serviceFeeEntry.create({
    data: {
      partnerId: establishedPartner.id,
      bookingPaymentId: purgedPayment.id,
      type: "CHARGE",
      amount: 25,
    },
    select: { id: true },
  });
  const { deleteUserAction } = await import("@/lib/admin-actions");

  const mismatchedDelete = await deleteUserAction(
    {},
    deletionForm(emptyPartner.id, "wrong@example.test")
  );
  ok(
    "typed email confirmation is enforced by the server",
    Boolean(mismatchedDelete.errors?.confirmationEmail) &&
      (await prisma.user.count({ where: { id: emptyPartner.id } })) === 1
  );

  const selfDelete = await deleteUserAction(
    {},
    deletionForm(admin.id, admin.email)
  );
  ok(
    "an administrator cannot delete their own active account",
    selfDelete.message?.includes("own administrator") === true &&
      (await prisma.user.count({ where: { id: admin.id } })) === 1
  );

  const purgedPlayerDeleteResult = await deleteUserAction(
    {},
    deletionForm(purgedPlayer.id, purgedPlayerEmail, true)
  );
  ok(
    "an admin can delete a player and explicitly purge test transactions",
    !purgedPlayerDeleteResult.message &&
      !purgedPlayerDeleteResult.errors &&
      (await prisma.user.count({ where: { id: purgedPlayer.id } })) === 0 &&
      (await prisma.bookingPayment.count({
        where: { id: purgedPayment.id },
      })) === 0 &&
      (await prisma.booking.count({ where: { id: purgedBooking.id } })) === 0 &&
      (await prisma.serviceFeeEntry.count({
        where: { id: purgedFeeEntry.id },
      })) === 0
  );

  const paidPlayerDeleteResult = await deleteUserAction(
    {},
    deletionForm(paidPlayer.id, paidPlayerEmail)
  );
  const { venueRevenue } = await import("@/lib/analytics");
  const retainedRevenue = await venueRevenue({
    partnerId: establishedPartner.id,
    range: { from: "2098-12-01", to: "2098-12-01", grain: "day" },
  });
  ok(
    "deleting a player anonymizes paid booking history without changing venue revenue",
    !paidPlayerDeleteResult.message &&
      !paidPlayerDeleteResult.errors &&
      (await prisma.user.count({ where: { id: paidPlayer.id } })) === 0 &&
      (await prisma.bookingPayment.count({
        where: { id: paidPayment.id, userId: null },
      })) === 1 &&
      (await prisma.booking.count({
        where: { id: paidBooking.id, userId: null },
      })) === 1 &&
      (await prisma.serviceFeeEntry.count({
        where: { id: paidFeeEntry.id },
      })) === 1 &&
      retainedRevenue.totals.gross === 500 &&
      retainedRevenue.totals.net === 500 &&
      retainedRevenue.totals.count === 1
  );

  const emptyDeleteResult = await deleteUserAction(
    {},
    deletionForm(emptyPartner.id, emptyPartnerEmail.toUpperCase())
  );
  ok(
    "an active partner can be deleted without deactivation",
    !emptyDeleteResult.message &&
      !emptyDeleteResult.errors &&
      (await prisma.user.count({ where: { id: emptyPartner.id } })) === 0
  );

  const establishedDeleteResult = await deleteUserAction(
    {},
    deletionForm(establishedPartner.id, establishedPartnerEmail)
  );
  ok(
    "an established active partner and its owned venue data can be deleted",
    !establishedDeleteResult.message &&
      !establishedDeleteResult.errors &&
      (await prisma.user.count({ where: { id: establishedPartner.id } })) === 0 &&
      (await prisma.hub.count({ where: { id: establishedPartner.hubs[0].id } })) === 0
  );
  ok(
    "partner deletion removes its namespaced webhook replay data",
    (await prisma.providerEvent.count({ where: { eventId: providerEventId } })) === 0
  );

  await prisma.trainerProfile.update({
    where: { userId: trainerUser.id },
    data: { status: "ACTIVE", activatedAt: new Date() },
  });
  const trainerDeleteResult = await deleteUserAction(
    {},
    deletionForm(trainerUser.id, `${EMAIL_PREFIX}1@example.test`)
  );
  ok(
    "an active trainer profile can be deleted with its owned data",
    !trainerDeleteResult.message &&
      (await prisma.user.count({ where: { id: trainerUser.id } })) === 0 &&
      (await prisma.trainerProfile.count({ where: { userId: trainerUser.id } })) === 0
  );

  const actorEmail = `${EMAIL_PREFIX}secondary-admin@example.test`;
  const contentEmail = `${EMAIL_PREFIX}content-player@example.test`;
  const invitationEmail = `${EMAIL_PREFIX}pending-staff@example.test`;
  const [actor, contentPlayer, survivingPartner, staffUser] = await Promise.all([
    prisma.user.create({
      data: { email: actorEmail, name: "Secondary Admin", role: "ADMIN" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: contentEmail, name: "Content Player", role: "PLAYER" },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}surviving-partner@example.test`,
        name: "Surviving Partner",
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        email: `${EMAIL_PREFIX}staff@example.test`,
        name: "Surviving Staff",
        role: "PLAYER",
      },
      select: { id: true },
    }),
  ]);
  await prisma.user.update({
    where: { id: survivingPartner.id },
    data: {
      partnerActivatedById: actor.id,
      chatRestrictedById: actor.id,
    },
  });
  const survivingHub = await prisma.hub.create({
    data: {
      ownerId: survivingPartner.id,
      name: "Surviving Venue",
      coverPhotos: [],
      games: ["pickleball"],
      courts: { create: { name: "Shared Court" } },
    },
    select: { id: true, courts: { select: { id: true } } },
  });
  const event = await prisma.event.create({
    data: {
      publicId: `${EMAIL_PREFIX}shared-event`,
      hubId: survivingHub.id,
      title: "Shared Event",
      sport: "pickleball",
      date: "2099-01-01",
      startHour: 8,
      endHour: 10,
      startsAt: new Date("2099-01-01T00:00:00.000Z"),
      endsAt: new Date("2099-01-01T02:00:00.000Z"),
      capacity: 8,
      registrationFee: 0,
    },
    select: { id: true },
  });
  const organizerGuest = await prisma.eventOrganizerGuest.create({
    data: {
      eventId: event.id,
      createdById: actor.id,
      name: "Shared Guest",
    },
    select: { id: true },
  });
  const courtBlock = await prisma.courtBlock.create({
    data: {
      hubId: survivingHub.id,
      type: "OTHER",
      date: "2099-01-02",
      startHour: 8,
      endHour: 9,
      createdById: actor.id,
      releasedById: actor.id,
    },
    select: { id: true },
  });
  const queue = await prisma.openPlayQueue.create({
    data: {
      publicId: `${EMAIL_PREFIX}shared-queue`,
      hubId: survivingHub.id,
      title: "Shared Queue",
      kind: "QUICK",
      createdById: actor.id,
    },
    select: { id: true },
  });
  const openPlaySession = await prisma.openPlaySession.create({
    data: {
      queueId: queue.id,
      createdById: actor.id,
      participants: {
        create: {
          source: "REGISTERED_PLAYER",
          userId: contentPlayer.id,
          displayName: "Content Player",
        },
      },
    },
    select: { id: true, participants: { select: { id: true } } },
  });
  const openPlayGame = await prisma.openPlayGame.create({
    data: {
      sessionId: openPlaySession.id,
      courtId: survivingHub.courts[0].id,
      sequence: 1,
      matchingMode: "BALANCED",
      createdById: actor.id,
    },
    select: { id: true },
  });
  const conversation = await prisma.chatConversation.create({
    data: {
      kind: "HUB_PLAYER",
      hubId: survivingHub.id,
      playerId: contentPlayer.id,
    },
    select: { id: true },
  });
  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderId: contentPlayer.id,
      body: "Personal message body",
      targetPath: "/private/path",
    },
    select: { id: true },
  });
  const report = await prisma.chatReport.create({
    data: {
      messageId: message.id,
      reporterId: actor.id,
      reviewerId: actor.id,
      category: "OTHER",
      details: "Personal report details",
      evidenceBody: "Personal message body",
      status: "RESOLVED",
      resolution: "Personal review resolution",
      reviewedAt: new Date(),
    },
    select: { id: true },
  });
  const waiver = await prisma.serviceFeeWaiver.create({
    data: {
      partnerId: survivingPartner.id,
      amount: 25,
      reason: "Shared financial history",
      grantedById: actor.id,
      balanceBefore: 100,
      balanceAfter: 75,
    },
    select: { id: true },
  });
  const membership = await prisma.partnerStaffMembership.create({
    data: {
      partnerId: survivingPartner.id,
      userId: staffUser.id,
      invitedById: actor.id,
    },
    select: { id: true },
  });
  const invitation = await prisma.partnerStaffInvitation.create({
    data: {
      partnerId: survivingPartner.id,
      invitedById: actor.id,
      email: invitationEmail,
      tokenHash: `${EMAIL_PREFIX}invitation-token`,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const activity = await prisma.partnerStaffActivity.create({
    data: {
      partnerId: survivingPartner.id,
      actorId: actor.id,
      action: "USER_DELETION_CHECK",
      targetType: "User",
      targetId: actor.id,
      metadata: { email: actorEmail, preserved: true },
    },
    select: { id: true },
  });
  const impersonationSession = await prisma.partnerImpersonationSession.create({
    data: {
      tokenHash: `${EMAIL_PREFIX}impersonation-token`,
      adminId: actor.id,
      partnerId: survivingPartner.id,
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    },
    select: { id: true },
  });
  const impersonationAudit = await prisma.partnerImpersonationAudit.create({
    data: {
      sessionId: impersonationSession.id,
      adminId: actor.id,
      partnerId: survivingPartner.id,
      action: `${EMAIL_PREFIX}IMPERSONATION_CHECK`,
      targetType: "User",
      targetId: actor.id,
    },
    select: { id: true },
  });
  await prisma.verificationToken.create({
    data: {
      identifier: actorEmail.toUpperCase(),
      token: `${EMAIL_PREFIX}verification-token`,
      expires: new Date("2099-01-01T00:00:00.000Z"),
    },
  });

  const contentDeleteResult = await deleteUserAction(
    {},
    deletionForm(contentPlayer.id, contentEmail)
  );
  const [redactedMessage, redactedParticipant, preservedConversation] =
    await Promise.all([
      prisma.chatMessage.findUnique({ where: { id: message.id } }),
      prisma.openPlayParticipant.findUnique({
        where: { id: openPlaySession.participants[0].id },
      }),
      prisma.chatConversation.findUnique({ where: { id: conversation.id } }),
    ]);
  ok(
    "shared chat and BunalQ history is preserved with player content redacted",
    !contentDeleteResult.message &&
      redactedMessage?.senderId === null &&
      redactedMessage.body === null &&
      redactedMessage.targetPath === null &&
      redactedMessage.deletedAt !== null &&
      redactedParticipant?.userId === null &&
      redactedParticipant.displayName === "Deleted player" &&
      preservedConversation?.playerId === null
  );
  ok(
    "copied report evidence from a deleted sender is redacted",
    (await prisma.chatReport.findUnique({ where: { id: report.id } }))
      ?.evidenceBody === null
  );

  const adminDeleteResult = await deleteUserAction(
    {},
    deletionForm(actor.id, actorEmail)
  );
  const [
    preservedWaiver,
    preservedMembership,
    preservedInvitation,
    preservedActivity,
    preservedAudit,
    preservedUser,
    preservedBlock,
    preservedQueue,
    preservedSession,
    preservedGame,
    preservedGuest,
    preservedReport,
  ] = await Promise.all([
    prisma.serviceFeeWaiver.findUnique({ where: { id: waiver.id } }),
    prisma.partnerStaffMembership.findUnique({ where: { id: membership.id } }),
    prisma.partnerStaffInvitation.findUnique({ where: { id: invitation.id } }),
    prisma.partnerStaffActivity.findUnique({ where: { id: activity.id } }),
    prisma.partnerImpersonationAudit.findUnique({
      where: { id: impersonationAudit.id },
    }),
    prisma.user.findUnique({ where: { id: survivingPartner.id } }),
    prisma.courtBlock.findUnique({ where: { id: courtBlock.id } }),
    prisma.openPlayQueue.findUnique({ where: { id: queue.id } }),
    prisma.openPlaySession.findUnique({ where: { id: openPlaySession.id } }),
    prisma.openPlayGame.findUnique({ where: { id: openPlayGame.id } }),
    prisma.eventOrganizerGuest.findUnique({ where: { id: organizerGuest.id } }),
    prisma.chatReport.findUnique({ where: { id: report.id } }),
  ]);
  ok(
    "another administrator can be deleted while shared financial and staffing rows survive",
    !adminDeleteResult.message &&
      (await prisma.user.count({ where: { id: actor.id } })) === 0 &&
      preservedWaiver?.grantedById === null &&
      preservedMembership?.invitedById === null &&
      preservedInvitation?.invitedById === null
  );
  ok(
    "email verification credentials are removed with the account",
    (await prisma.verificationToken.count({
      where: { token: `${EMAIL_PREFIX}verification-token` },
    })) === 0
  );
  ok(
    "surviving operational history removes administrator attribution",
    preservedActivity?.actorId === null &&
      preservedActivity.targetId === null &&
      JSON.stringify(preservedActivity.metadata).includes(actorEmail) === false &&
      preservedAudit?.adminId === null &&
      preservedAudit.partnerId === survivingPartner.id &&
      preservedAudit.sessionId === null &&
      preservedAudit.targetId === null &&
      (await prisma.partnerImpersonationSession.count({
        where: { id: impersonationSession.id },
      })) === 0
  );
  ok(
    "all scalar creator and reviewer references are anonymized",
    preservedUser?.partnerActivatedById === null &&
      preservedUser.chatRestrictedById === null &&
      preservedBlock?.createdById === null &&
      preservedBlock.releasedById === null &&
      preservedQueue?.createdById === null &&
      preservedSession?.createdById === null &&
      preservedGame?.createdById === null &&
      preservedGuest?.createdById === null &&
      preservedReport?.reporterId === null &&
      preservedReport.reviewerId === null &&
      preservedReport.details === null &&
      preservedReport.resolution === null
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
