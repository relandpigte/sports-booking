// Dev-only report fodder. Never imported by the app.
//
// The reports page reads the payment ledger, so a fresh database draws a flat
// zero line — correct, and useless for looking at the chart. This fills a month
// with believable court payments (quiet weekdays, busy weekends, one refund) so
// the shape can actually be judged.
//
//   node prisma/dev/seed-payments.mjs seed [YYYY-MM]   # default: this month
//   node prisma/dev/seed-payments.mjs clean            # remove them all
//
// Everything it writes uses hubId "dev-seed-hub", so `clean` can take it back
// out without touching real money.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [mode = "seed", monthArg] = process.argv.slice(2);

const HUB = "dev-seed-hub";
async function clean() {
  const courts = await prisma.bookingPayment.deleteMany({ where: { hubId: HUB } });
  console.log(`✓ removed ${courts.count} court payment(s)`);
}

async function seed() {
  const partner = await prisma.user.findFirst({
    where: { role: "PARTNER", partnerStatus: "ACTIVE" },
    select: { id: true },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  const gateway = partner
    ? await prisma.partnerGateway.findFirst({
        where: { userId: partner.id, disconnectedAt: null },
        select: { id: true },
      })
    : null;

  if (!partner) throw new Error("No partner account to attribute payments to.");
  if (!player) throw new Error("No player account to attribute payments to.");
  if (!gateway) {
    throw new Error(
      "No connected gateway. Connect one on /dashboard/payments first."
    );
  }

  const now = new Date();
  const [year, month] = monthArg
    ? monthArg.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`Bad month: ${monthArg}. Use YYYY-MM.`);
  }

  // Don't invent payments in the future.
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isThisMonth =
    year === now.getUTCFullYear() && month === now.getUTCMonth() + 1;
  const lastDay = isThisMonth ? now.getUTCDate() : daysInMonth;

  await clean();

  const rows = [];
  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekend = [0, 6].includes(date.getUTCDay());
    const bookings = weekend ? 3 : day % 3 === 0 ? 2 : day % 2 === 0 ? 1 : 0;

    for (let i = 0; i < bookings; i++) {
      const hours = 1 + ((day + i) % 4);
      const venueAmount = 250 * hours;
      const platformFee = hours === 1 ? 15 : 25;
      const amount = venueAmount + platformFee;
      const paidAt = new Date(Date.UTC(year, month - 1, day, 2 + i * 5, 15));
      // One refund mid-month, so the chart has a dip that means something.
      const refunded = day === Math.floor(lastDay / 2) && i === 0;
      rows.push({
        partnerId: partner.id,
        gatewayId: gateway.id,
        userId: player.id,
        hubId: HUB,
        amount,
        venueAmount,
        platformFee,
        method: i % 3 === 0 ? "GCASH" : "CARD",
        status: refunded ? "REFUNDED" : "SUCCEEDED",
        expiresAt: paidAt,
        provider: "paymongo",
        paidAt,
        refundedAt: refunded ? new Date(paidAt.getTime() + 86_400_000) : null,
        refundedAmount: refunded ? amount : null,
      });
    }
  }
  await prisma.bookingPayment.createMany({ data: rows });

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  console.log(
    `✓ ${rows.length} court payment(s) across ${year}-${String(month).padStart(2, "0")}, ₱${total.toLocaleString()} gross`
  );
  console.log("  Open /dashboard/reports, or /dashboard/admin/reports as an admin.");
  console.log("  Remove it all with: node prisma/dev/seed-payments.mjs clean");
}

const run = mode === "clean" ? clean : seed;
run()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
