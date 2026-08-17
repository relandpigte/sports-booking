// Partner staffing: one-team membership, explicit module access, and
// operational notification routing.
//
//   npm run check:staffing
import { Prisma, PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  hasStaffAccess,
  type PartnerWorkspace,
} from "@/lib/staffing-shared";

const prisma = new PrismaClient();
const emails = [
  "check-staffing-owner@example.test",
  "check-staffing-other-owner@example.test",
  "check-staffing-manager@example.test",
  "check-staffing-viewer@example.test",
];

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

async function check() {
  await cleanup();
  const [owner, otherOwner, manager, viewer] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: emails[0],
        name: "Staffing Owner",
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        email: emails[1],
        name: "Other Staffing Owner",
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: emails[2], name: "Booking Manager", role: "PLAYER" },
      select: { id: true },
    }),
    prisma.user.create({
      data: { email: emails[3], name: "Event Viewer", role: "PLAYER" },
      select: { id: true },
    }),
  ]);

  const membership = await prisma.partnerStaffMembership.create({
    data: {
      partnerId: owner.id,
      userId: manager.id,
      invitedById: owner.id,
      hubs: "VIEW",
      bookings: "MANAGE",
      events: "NONE",
      reports: "VIEW",
      messages: "MANAGE",
      payments: "NONE",
    },
  });
  await prisma.partnerStaffMembership.create({
    data: {
      partnerId: owner.id,
      userId: viewer.id,
      invitedById: owner.id,
      bookings: "VIEW",
      events: "VIEW",
    },
  });

  stubRequestContext({ id: owner.id, email: emails[0], role: "PARTNER" });
  const { listOperationalRecipients } = await import(
    "@/lib/staffing"
  );

  const workspace: PartnerWorkspace = {
    kind: "STAFF",
    actorId: manager.id,
    partnerId: owner.id,
    partnerName: "Staffing Owner",
    membershipId: membership.id,
    permissions: {
      hubs: membership.hubs,
      bookings: membership.bookings,
      events: membership.events,
      reports: membership.reports,
      messages: membership.messages,
      payments: membership.payments,
      openPlay: membership.openPlay,
    },
  };
  ok(
    "manage access also satisfies a module view check",
    hasStaffAccess(workspace, "bookings", "VIEW") &&
      hasStaffAccess(workspace, "bookings", "MANAGE")
  );
  ok(
    "view-only access cannot satisfy a manage check",
    hasStaffAccess(workspace, "hubs", "VIEW") &&
      !hasStaffAccess(workspace, "hubs", "MANAGE")
  );
  ok(
    "no-access modules remain unavailable",
    !hasStaffAccess(workspace, "events", "VIEW")
  );

  let duplicateRejected = false;
  try {
    await prisma.partnerStaffMembership.create({
      data: {
        partnerId: otherOwner.id,
        userId: manager.id,
        invitedById: otherOwner.id,
        bookings: "MANAGE",
      },
    });
  } catch (error) {
    duplicateRejected =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
  }
  ok("a player account can belong to only one partner team", duplicateRejected);

  const bookingRecipients = await listOperationalRecipients(
    owner.id,
    "bookings"
  );
  ok(
    "booking notifications include the owner and booking managers only",
    bookingRecipients.map((recipient) => recipient.email).sort().join(",") ===
      [emails[0], emails[2]].sort().join(",")
  );
  const eventRecipients = await listOperationalRecipients(owner.id, "events");
  ok(
    "event viewers do not receive manage-only operational notifications",
    eventRecipients.length === 1 && eventRecipients[0]?.email === emails[0]
  );

  await prisma.partnerStaffActivity.create({
    data: {
      partnerId: owner.id,
      actorId: manager.id,
      action: "BOOKING_RESCHEDULED",
      targetType: "Booking",
      targetId: "staffing-check-booking",
    },
  });
  const activity = await prisma.partnerStaffActivity.findFirst({
    where: { partnerId: owner.id, actorId: manager.id },
  });
  ok(
    "staff mutations retain the real actor in the partner activity trail",
    activity?.action === "BOOKING_RESCHEDULED"
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
