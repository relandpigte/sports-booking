// Weekly per-court closures and rate overrides, including booking protection.
//
//   npm run check:schedule
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { WEEKDAYS, type OperatingHours } from "@/lib/constants";
import {
  buildSlots,
  slotTotal,
  weekdayIndexForDate,
} from "@/lib/slots";
import { addDays, manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-court-schedule-partner@example.test";
const PLAYER_EMAIL = "check-court-schedule-player@example.test";

let partnerId: string | null = null;
let playerId: string | null = null;

const operatingHours = Object.fromEntries(
  WEEKDAYS.map(({ value }) => [
    value,
    { closed: false, open: "06:00", close: "22:00" },
  ])
) as OperatingHours;

function nextMonday(): string {
  let date = "2099-12-01";
  while (weekdayIndexForDate(date) !== 0) date = addDays(date, 1);
  return date;
}

async function check() {
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, PLAYER_EMAIL] } },
  });

  const partner = await prisma.user.create({
    data: {
      name: "Schedule check partner",
      email: PARTNER_EMAIL,
      passwordHash: "x",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true, email: true },
  });
  partnerId = partner.id;
  const player = await prisma.user.create({
    data: {
      name: "Schedule check player",
      email: PLAYER_EMAIL,
      passwordHash: "x",
      role: "PLAYER",
    },
    select: { id: true },
  });
  playerId = player.id;

  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Schedule Check Hub",
      slug: `schedule-check-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
      operatingHours,
      courts: {
        create: { name: "Court A", hourlyRate: 500 },
      },
    },
    select: { id: true, courts: { select: { id: true } } },
  });
  const court = hub.courts[0];

  stubRequestContext(partner);
  const { updateCourtScheduleAction } = await import(
    "@/lib/court-schedule-actions"
  );

  const baseRules = [
    {
      courtId: court.id,
      weekday: 0,
      hour: 9,
      closed: false,
      closureReason: null,
      hourlyRate: 750,
    },
    {
      courtId: court.id,
      weekday: 0,
      hour: 10,
      closed: true,
      closureReason: "Court maintenance",
      hourlyRate: null,
    },
  ];
  const form = new FormData();
  form.set("hubId", hub.id);
  form.set("rules", JSON.stringify(baseRules));
  const saved = await updateCourtScheduleAction({}, form);
  ok("a partner can save sparse weekly court rules", Boolean(saved.success));

  const stored = await prisma.courtSlotRule.findMany({
    where: { courtId: court.id },
    orderBy: { hour: "asc" },
  });
  ok(
    "the override and closure persist independently",
    stored.length === 2 &&
      Number(stored[0].hourlyRate) === 750 &&
      stored[0].closed === false &&
      stored[1].closed === true &&
      stored[1].closureReason === "Court maintenance"
  );

  const monday = nextMonday();
  const { slots } = buildSlots({
    operatingHours,
    date: monday,
    bookedHours: [],
    today: "2099-11-01",
    nowHour: 0,
    courtHourlyRate: 500,
    scheduleRules: stored.map((rule) => ({
      weekday: rule.weekday,
      hour: rule.hour,
      closed: rule.closed,
      closureReason: rule.closureReason,
      hourlyRate: rule.hourlyRate == null ? null : Number(rule.hourlyRate),
    })),
  });
  ok(
    "a weekly closure is unavailable on the matching weekday",
    slots.find((slot) => slot.hour === 10)?.reason === "closed" &&
      slots.find((slot) => slot.hour === 10)?.closureReason ===
        "Court maintenance"
  );
  ok(
    "a selectable hour is labelled as its full one-hour range",
    slots.find((slot) => slot.hour === 9)?.label === "9:00 AM – 10:00 AM"
  );
  ok(
    "an override replaces the court default for only that hour",
    slots.find((slot) => slot.hour === 9)?.hourlyRate === 750 &&
      slots.find((slot) => slot.hour === 11)?.hourlyRate === 500
  );
  ok(
    "mixed hourly rates total exactly",
    slotTotal(slots, [9, 11]) === 1_250
  );

  await prisma.booking.create({
    data: {
      courtId: court.id,
      hubId: hub.id,
      userId: player.id,
      date: monday,
      startHour: 12,
      endHour: 13,
      hours: 1,
      startsAt: manilaInstant(monday, 12),
      endsAt: manilaInstant(monday, 13),
      hourlyRate: 500,
      totalPrice: 500,
      status: "CONFIRMED",
      slots: {
        create: { courtId: court.id, date: monday, hour: 12 },
      },
    },
  });

  const conflicting = new FormData();
  conflicting.set("hubId", hub.id);
  conflicting.set(
    "rules",
    JSON.stringify([
      ...baseRules,
      {
        courtId: court.id,
        weekday: 0,
        hour: 12,
        closed: true,
        closureReason: "Private event",
        hourlyRate: null,
      },
    ])
  );
  const blocked = await updateCourtScheduleAction({}, conflicting);
  ok(
    "an upcoming booking blocks closing its recurring hour",
    blocked.message?.includes("upcoming booking") === true
  );
  ok(
    "a rejected save leaves the previous schedule intact",
    (await prisma.courtSlotRule.count({ where: { courtId: court.id } })) === 2
  );
}

async function cleanup() {
  if (partnerId) await prisma.user.deleteMany({ where: { id: partnerId } });
  if (playerId) await prisma.user.deleteMany({ where: { id: playerId } });
  await prisma.$disconnect();
}

run(check, cleanup);
