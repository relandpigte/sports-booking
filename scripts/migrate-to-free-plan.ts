// One-off migration: paid tiers become a single free plan.
//
//   npm run migrate:free-plan          # show what would change
//   npm run migrate:free-plan -- apply
//
// Joining is free now and revenue comes from the per-booking service fee, so
// the ₱499/₱1,499/₱2,999 tiers have nothing left to sell. A Plan row still has
// to exist — Subscription.planId and Payment.planId are required, and a
// historical Payment must keep pointing at the tier that was actually bought —
// so the lowest tier is repurposed rather than deleted.
//
// Court limits disappear as a side effect, and deliberately: checkCourtLimit
// already returns ok when maxCourts is null, so setting it null on the free
// plan removes the cap without touching that code.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("apply");

async function main() {
  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  if (plans.length === 0) throw new Error("No plans found — run the seed first.");

  const free = plans[0];
  const retired = plans.slice(1);

  const subs = await prisma.subscription.findMany({
    select: { id: true, userId: true, planId: true, status: true },
  });
  const moving = subs.filter((s) => s.planId !== free.id);

  // Payments taken before the fee existed carry no split. The whole amount was
  // the venue's, because no fee was ever added — writing 5% onto them now would
  // invent a debt they never collected from anybody.
  const unsplit = await prisma.bookingPayment.count({
    where: { venueAmount: 0, platformFee: 0 },
  });

  console.log(`Free plan:      ${free.key} "${free.name}" → "Free", ₱0, unlimited courts`);
  console.log(`Retiring:       ${retired.map((p) => p.key).join(", ") || "none"}`);
  console.log(`Subscriptions:  ${moving.length} of ${subs.length} move onto the free plan`);
  console.log(
    `Payments:       untouched — each keeps the planId it was actually billed under`
  );
  console.log(
    `Pre-fee splits: ${unsplit} booking payment(s) get venueAmount = amount, fee ₱0`
  );

  if (!apply) {
    console.log("\nDry run. Re-run with `-- apply` to write.");
    return;
  }

  await prisma.$transaction([
    prisma.plan.update({
      where: { id: free.id },
      data: {
        name: "Free",
        blurb: "No monthly fee. A 5% service fee is added to each booking.",
        priceMonthly: 0,
        // null = unlimited, which is what makes checkCourtLimit a no-op.
        maxCourts: null,
        active: true,
        sortOrder: 0,
      },
    }),
    // Kept, not deleted: a Payment row still references them.
    prisma.plan.updateMany({
      where: { id: { in: retired.map((p) => p.id) } },
      data: { active: false },
    }),
    prisma.subscription.updateMany({
      where: { planId: { not: free.id } },
      data: { planId: free.id },
    }),
    // Idempotent: once venueAmount is set it no longer matches.
    prisma.$executeRaw`
      UPDATE "BookingPayment"
      SET "venueAmount" = "amount"
      WHERE "venueAmount" = 0 AND "platformFee" = 0
    `,
  ]);

  console.log("\n✓ Applied.");
  console.log(
    "  Existing partners are on the free plan with no court cap. Their next\n" +
      "  invoice is whatever service fees they have collected — often ₱0, which\n" +
      "  is now a month that is never invoiced at all."
  );
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
