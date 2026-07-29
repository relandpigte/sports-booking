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
// Everything it writes is tagged — hubId "dev-seed-hub" and providerRef
// "dev-seed" — so `clean` can take it back out without touching real money.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [mode = "seed", monthArg] = process.argv.slice(2);

const HUB = "dev-seed-hub";
const TAG = "dev-seed";

async function clean() {
  const courts = await prisma.bookingPayment.deleteMany({ where: { hubId: HUB } });
  const subs = await prisma.payment.deleteMany({ where: { providerRef: TAG } });
  console.log(
    `✓ removed ${courts.count} court payment(s) and ${subs.count} subscription payment(s)`
  );
}

async function seed() {
  const partner = await prisma.user.findFirst({
    where: { role: "PARTNER" },
    select: { id: true, subscription: { select: { id: true, planId: true } } },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  const gateway = await prisma.partnerGateway.findFirst({ select: { id: true } });

  if (!partner) throw new Error("No partner account to attribute payments to.");
  if (!player) throw new Error("No player account to attribute payments to.");
  if (!gateway) {
    throw new Error(
      "No connected gateway. Connect one on /dashboard/billing first — a BookingPayment has to belong to a gateway."
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
      const amount = 250 * (1 + ((day + i) % 4));
      const paidAt = new Date(Date.UTC(year, month - 1, day, 2 + i * 5, 15));
      // One refund mid-month, so the chart has a dip that means something.
      const refunded = day === Math.floor(lastDay / 2) && i === 0;
      rows.push({
        partnerId: partner.id,
        gatewayId: gateway.id,
        userId: player.id,
        hubId: HUB,
        amount,
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

  // A couple of subscription payments so the admin's Platform tab has a line
  // too. Written straight to the ledger — the subscription itself is NOT
  // advanced, because that is applySuccessfulPayment's job and this is fodder,
  // not a real collection.
  let subs = 0;
  if (partner.subscription) {
    for (const day of [2, 17]) {
      if (day > lastDay) continue;
      const paidAt = new Date(Date.UTC(year, month - 1, day, 3, 0));
      await prisma.payment.create({
        data: {
          subscriptionId: partner.subscription.id,
          userId: partner.id,
          planId: partner.subscription.planId,
          kind: "MANUAL",
          amount: 1499,
          method: "CARD",
          status: "SUCCEEDED",
          periodStart: paidAt,
          periodEnd: new Date(Date.UTC(year, month, day)),
          paidAt,
          providerRef: TAG,
          idempotencyKey: `${TAG}:${year}-${month}-${day}`,
        },
      });
      subs++;
    }
  }

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  console.log(
    `✓ ${rows.length} court payment(s) across ${year}-${String(month).padStart(2, "0")}, ₱${total.toLocaleString()} gross, plus ${subs} subscription payment(s)`
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
