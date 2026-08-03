// The reap and the race, at the level the unique index actually operates on.
// Mirrors the transaction in createBookingAction exactly. Cleans up after.
import { PrismaClient, Prisma } from "@prisma/client";
import { lockPlayerBookingHours } from "@/lib/booking-locks";

import { ok, run } from "./harness";

const prisma = new PrismaClient();

const DATE = "2099-12-29";

class PlayerBusy extends Error {}

async function makeHold(
  courtId: string,
  hubId: string,
  userId: string,
  hours: number[],
  holdExpiresAt: Date | null
) {
  return prisma.booking.create({
    data: {
      courtId,
      hubId,
      userId,
      date: DATE,
      startHour: hours[0],
      endHour: hours[hours.length - 1] + 1,
      hours: hours.length,
      startsAt: new Date(`${DATE}T00:00:00.000Z`),
      endsAt: new Date(`${DATE}T01:00:00.000Z`),
      status: holdExpiresAt ? "PENDING" : "CONFIRMED",
      holdExpiresAt,
      slots: {
        create: hours.map((hour) => ({ courtId, date: DATE, hour, holdExpiresAt })),
      },
    },
    select: { id: true },
  });
}

// The transaction from createBookingAction, minus the parts needing a request.
async function claim(
  courtId: string,
  hubId: string,
  userId: string,
  hours: number[],
  now: Date
) {
  return prisma.$transaction(async (tx) => {
    await tx.bookingSlot.deleteMany({
      where: { courtId, date: DATE, hour: { in: hours }, holdExpiresAt: { lt: now } },
    });
    const booking = await tx.booking.create({
      data: {
        courtId,
        hubId,
        userId,
        date: DATE,
        startHour: hours[0],
        endHour: hours[hours.length - 1] + 1,
        hours: hours.length,
        startsAt: new Date(`${DATE}T00:00:00.000Z`),
        endsAt: new Date(`${DATE}T01:00:00.000Z`),
        status: "CONFIRMED",
      },
      select: { id: true },
    });
    await tx.bookingSlot.createMany({
      data: hours.map((hour) => ({
        bookingId: booking.id,
        courtId,
        date: DATE,
        hour,
      })),
    });
    return booking.id;
  });
}

async function claimForPlayer(
  courtId: string,
  hubId: string,
  userId: string,
  hour: number
) {
  const startsAt = new Date(
    `${DATE}T${String(hour).padStart(2, "0")}:00:00.000Z`
  );
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);

  return prisma.$transaction(async (tx) => {
    await lockPlayerBookingHours(tx, userId, DATE, [hour]);
    const clash = await tx.booking.findFirst({
      where: {
        userId,
        status: "CONFIRMED",
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (clash) throw new PlayerBusy();

    const booking = await tx.booking.create({
      data: {
        courtId,
        hubId,
        userId,
        date: DATE,
        startHour: hour,
        endHour: hour + 1,
        hours: 1,
        startsAt,
        endsAt,
        status: "CONFIRMED",
      },
      select: { id: true },
    });
    await tx.bookingSlot.create({
      data: { bookingId: booking.id, courtId, date: DATE, hour },
    });
    return booking.id;
  });
}

async function main() {
  const court = await prisma.court.findFirst({ select: { id: true, hubId: true } });
  const [a, b] = await prisma.user.findMany({
    where: { role: { in: ["PLAYER", "ADMIN"] } },
    take: 2,
    select: { id: true },
  });
  if (!court || !a || !b) throw new Error("need a court and two users");

  const past = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 15 * 60_000);
  const now = new Date();

  // --- 1. A DEAD hold must not block a booking -----------------------------
  const dead = await makeHold(court.id, court.hubId, a.id, [20, 21], past);
  let claimed: string | null = null;
  try {
    claimed = await claim(court.id, court.hubId, b.id, [20, 21], now);
  } catch {
    claimed = null;
  }
  ok("a dead hold is reaped, not a collision", claimed !== null);
  ok(
    "the dead hold lost its slots",
    (await prisma.bookingSlot.count({ where: { bookingId: dead.id } })) === 0
  );
  ok(
    "the new booking holds both hours",
    (await prisma.bookingSlot.count({ where: { bookingId: claimed! } })) === 2
  );

  // --- 2. A LIVE hold must still block -------------------------------------
  const live = await makeHold(court.id, court.hubId, a.id, [22], future);
  let blocked = false;
  try {
    await claim(court.id, court.hubId, b.id, [22], now);
  } catch (error) {
    blocked =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
  }
  ok("a live hold blocks the claim", blocked);
  ok(
    "the live hold kept its slot",
    (await prisma.bookingSlot.count({ where: { bookingId: live.id } })) === 1
  );

  // --- 3. Two players reaping the same dead hold at once -------------------
  const contested = await makeHold(court.id, court.hubId, a.id, [23], past);
  const results = await Promise.allSettled([
    claim(court.id, court.hubId, a.id, [23], now),
    claim(court.id, court.hubId, b.id, [23], now),
  ]);
  ok(
    "exactly one of two concurrent claims wins",
    results.filter((r) => r.status === "fulfilled").length === 1
  );
  ok(
    "the hour is held exactly once",
    (await prisma.bookingSlot.count({
      where: { courtId: court.id, date: DATE, hour: 23 },
    })) === 1
  );
  ok(
    "the loser left nothing behind",
    (await prisma.booking.count({
      where: { date: DATE, startHour: 23, id: { not: contested.id } },
    })) === 1
  );

  // --- 4. One player cannot claim two courts for the same hour ------------
  const secondCourt = await prisma.court.create({
    data: {
      hubId: court.hubId,
      name: `Player lock check ${Date.now()}`,
      courtType: "covered",
    },
    select: { id: true },
  });
  const playerResults = await Promise.allSettled([
    claimForPlayer(court.id, court.hubId, a.id, 18),
    claimForPlayer(secondCourt.id, court.hubId, a.id, 18),
  ]);
  ok(
    "exactly one concurrent court claim succeeds for one player-hour",
    playerResults.filter((result) => result.status === "fulfilled").length === 1
  );
  ok(
    "the player owns exactly one booking at that time",
    (await prisma.booking.count({
      where: { userId: a.id, date: DATE, startHour: 18 },
    })) === 1
  );

  await prisma.booking.deleteMany({ where: { date: DATE } });
  await prisma.court.delete({ where: { id: secondCourt.id } });
  ok("cleaned up", (await prisma.booking.count({ where: { date: DATE } })) === 0);

}

void run(main, async () => {
  await prisma.$disconnect();
});
