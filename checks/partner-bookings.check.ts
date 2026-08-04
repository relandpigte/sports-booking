// Partner booking operations: ownership, filters, tabs, and pagination.
//
//   npm run check:partner-bookings
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { addDays, manilaInstant, manilaToday } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-booking-list-partner@example.test";
const OUTSIDER_EMAIL = "check-booking-list-outsider@example.test";
const PLAYER_EMAIL = "check-booking-list-player@example.test";
const TARGET_EMAIL = "check-booking-list-target@example.test";
const emails = [
  PARTNER_EMAIL,
  OUTSIDER_EMAIL,
  PLAYER_EMAIL,
  TARGET_EMAIL,
];

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
}

async function check() {
  await cleanup();
  const [partner, outsider, player, target] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Booking list partner",
        email: PARTNER_EMAIL,
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true, email: true },
    }),
    prisma.user.create({
      data: {
        name: "Outsider partner",
        email: OUTSIDER_EMAIL,
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        name: "Regular Player",
        email: PLAYER_EMAIL,
        role: "PLAYER",
      },
      select: { id: true },
    }),
    prisma.user.create({
      data: {
        name: "Search Target",
        phone: "+639171234567",
        email: TARGET_EMAIL,
        role: "PLAYER",
      },
      select: { id: true },
    }),
  ]);
  const [hub, outsiderHub] = await Promise.all([
    prisma.hub.create({
      data: {
        ownerId: partner.id,
        name: "Filter Check Hub",
        coverPhotos: [],
        games: ["pickleball"],
        courts: { create: { name: "Court One", hourlyRate: 500 } },
      },
      select: { id: true, courts: { select: { id: true } } },
    }),
    prisma.hub.create({
      data: {
        ownerId: outsider.id,
        name: "Outsider Hub",
        coverPhotos: [],
        games: ["pickleball"],
        courts: { create: { name: "Private Court", hourlyRate: 500 } },
      },
      select: { id: true, courts: { select: { id: true } } },
    }),
  ]);
  const date = addDays(manilaToday(), 14);
  const pastDate = addDays(manilaToday(), -14);
  const courtId = hub.courts[0].id;

  await prisma.booking.createMany({
    data: Array.from({ length: 20 }, (_, index) => ({
      hubId: hub.id,
      courtId,
      userId: player.id,
      date,
      startHour: 8,
      endHour: 9,
      hours: 1,
      startsAt: new Date(manilaInstant(date, 8).getTime() + index * 1_000),
      endsAt: manilaInstant(date, 9),
      hourlyRate: 500,
      totalPrice: 500,
      status: "CONFIRMED" as const,
    })),
  });
  await prisma.booking.createMany({
    data: [
      {
        hubId: hub.id,
        courtId,
        userId: target.id,
        date,
        startHour: 10,
        endHour: 11,
        hours: 1,
        startsAt: manilaInstant(date, 10),
        endsAt: manilaInstant(date, 11),
        status: "CONFIRMED",
      },
      {
        hubId: hub.id,
        courtId,
        userId: player.id,
        date,
        startHour: 12,
        endHour: 13,
        hours: 1,
        startsAt: manilaInstant(date, 12),
        endsAt: manilaInstant(date, 13),
        status: "PENDING",
        holdExpiresAt: new Date(Date.now() + 600_000),
      },
      {
        hubId: hub.id,
        courtId,
        userId: player.id,
        date: pastDate,
        startHour: 8,
        endHour: 9,
        hours: 1,
        startsAt: manilaInstant(pastDate, 8),
        endsAt: manilaInstant(pastDate, 9),
        status: "CANCELLED",
      },
      {
        hubId: outsiderHub.id,
        courtId: outsiderHub.courts[0].id,
        userId: player.id,
        date,
        startHour: 8,
        endHour: 9,
        hours: 1,
        startsAt: manilaInstant(date, 8),
        endsAt: manilaInstant(date, 9),
        status: "CONFIRMED",
      },
    ],
  });

  stubRequestContext(partner);
  const { listPartnerBookings } = await import("@/lib/bookings");
  const base = { section: "upcoming" as const, sort: "soonest" as const };
  const firstPage = await listPartnerBookings({ ...base, page: 1 });
  ok(
    "the first page is capped at twenty owned bookings",
    firstPage.total === 22 &&
      firstPage.items.length === 20 &&
      firstPage.pageCount === 2
  );
  const secondPage = await listPartnerBookings({ ...base, page: 2 });
  ok("the final page contains the remainder", secondPage.items.length === 2);

  const searched = await listPartnerBookings({
    ...base,
    query: "Search Target",
    page: 1,
  });
  ok(
    "player search is resolved on the server",
    searched.total === 1 && searched.items[0]?.player.name === "Search Target"
  );
  const pending = await listPartnerBookings({
    ...base,
    status: "PENDING",
    page: 1,
  });
  ok(
    "status filters use the live effective status",
    pending.total === 1 && pending.items[0]?.status === "PENDING"
  );
  const history = await listPartnerBookings({
    section: "history",
    sort: "soonest",
    page: 1,
  });
  ok(
    "cancelled and finished bookings appear in history",
    history.total === 1 && history.items[0]?.status === "CANCELLED"
  );
  const foreignHub = await listPartnerBookings({
    ...base,
    hubId: outsiderHub.id,
    page: 1,
  });
  ok("a forged hub filter cannot expose another partner", foreignHub.total === 0);
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
