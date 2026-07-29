// Dev-only clock back-dater for booking holds. Never imported by the app.
//
// A hold lasts 15 minutes, and the interesting behaviour is what happens at the
// end of it — so this drags a player's live holds into the past. The point is
// that NOTHING ELSE has to run afterwards: the grid frees the hours on its next
// SSE tick because every availability read filters holdExpiresAt against the
// clock.
//
//   node prisma/dev/expire-hold.mjs <playerEmail> expire   # lapse every live hold
//   node prisma/dev/expire-hold.mjs <playerEmail> show     # dump holds + payments
//
// After `expire`, the useful thing to try is booking those same hours from a
// second account: it must SUCCEED. That exercises the reap in
// createBookingAction, which is what stops a dead hold's slot row from
// blocking an insert the unique index knows nothing about.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [email, mode = "show"] = process.argv.slice(2);

if (!email) {
  console.error(
    "usage: node prisma/dev/expire-hold.mjs <playerEmail> [expire|show]"
  );
  process.exit(1);
}

const ago = new Date(Date.now() - 60_000); // a minute in the past

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error(`No user with email ${email}`);

  if (mode === "expire") {
    const holds = await prisma.booking.findMany({
      where: { userId: user.id, status: "PENDING" },
      select: { id: true },
    });
    const ids = holds.map((b) => b.id);
    if (!ids.length) {
      console.log(`${email} has no pending holds.`);
    } else {
      // Booking, slot mirror and payment window all move together — they are
      // the same deadline expressed three times.
      await prisma.$transaction([
        prisma.booking.updateMany({
          where: { id: { in: ids } },
          data: { holdExpiresAt: ago },
        }),
        prisma.bookingSlot.updateMany({
          where: { bookingId: { in: ids } },
          data: { holdExpiresAt: ago },
        }),
        prisma.bookingPayment.updateMany({
          where: { bookings: { some: { id: { in: ids } } } },
          data: { expiresAt: ago },
        }),
      ]);
      console.log(`✓ ${ids.length} hold(s) moved into the past for ${email}`);
      console.log(
        "  The hours are already free — no sweep needed. Reload the hub page."
      );
    }
  } else if (mode !== "show") {
    throw new Error(`Unknown mode: ${mode}`);
  }

  const bookings = await prisma.booking.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      date: true,
      startHour: true,
      endHour: true,
      status: true,
      holdExpiresAt: true,
      court: { select: { name: true } },
      _count: { select: { slots: true } },
    },
  });

  const payments = await prisma.bookingPayment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  const now = Date.now();
  console.log("\n--- bookings ---");
  console.table(
    bookings.map((b) => ({
      court: b.court.name,
      when: `${b.date} ${b.startHour}-${b.endHour}`,
      stored: b.status,
      // What the app actually shows: a lapsed hold reads as EXPIRED long
      // before the sweep touches the column.
      effective:
        b.status === "PENDING" &&
        b.holdExpiresAt &&
        b.holdExpiresAt.getTime() <= now
          ? "EXPIRED"
          : b.status,
      slots: b._count.slots,
      holdEnds: b.holdExpiresAt?.toISOString() ?? null,
    }))
  );

  console.log("--- booking payments ---");
  console.table(
    payments.map((p) => ({
      status: p.status,
      amount: String(p.amount),
      method: p.method,
      attempt: p.attempt,
      charging: p.chargeStartedAt != null,
      expiresAt: p.expiresAt.toISOString(),
      ref: p.providerRef ?? p.failureCode ?? "",
    }))
  );
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
