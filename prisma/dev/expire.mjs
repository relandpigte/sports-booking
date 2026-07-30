// Dev-only clock back-dater. Never imported by the app.
//
// Testing a monthly billing period shouldn't mean waiting — this drags a
// subscription's deadlines into the past so the next page load runs the
// transition you want to see.
//
// There is no trial any more (joining is free), but the mode is kept for the
// historical rows that still carry a trialEndsAt.
//
//   node prisma/dev/expire.mjs <email> trial    # end a legacy trial now
//   node prisma/dev/expire.mjs <email> period   # end the paid period now
//   node prisma/dev/expire.mjs <email> grace    # end the grace window now
//   node prisma/dev/expire.mjs <email> retry    # make a card retry due now
//   node prisma/dev/expire.mjs <email> show     # dump the row + last payments

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [email, mode = "show"] = process.argv.slice(2);

if (!email) {
  console.error("usage: node prisma/dev/expire.mjs <email> [trial|period|grace|retry|show]");
  process.exit(1);
}

const ago = new Date(Date.now() - 60_000); // a minute in the past

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw new Error(`No user with email ${email}`);

  const sub = await prisma.subscription.findUnique({
    where: { userId: user.id },
    include: { plan: true },
  });
  if (!sub) throw new Error(`${email} has no subscription`);

  if (mode !== "show") {
    const data =
      mode === "trial"
        ? { trialEndsAt: ago }
        : mode === "period"
          ? { currentPeriodEnd: ago }
          : mode === "grace"
            ? { graceEndsAt: ago }
            : mode === "retry"
              ? { nextRetryAt: ago }
              : null;
    if (!data) throw new Error(`Unknown mode: ${mode}`);

    await prisma.subscription.update({ where: { id: sub.id }, data });
    console.log(`✓ ${mode} deadline moved into the past for ${email}`);
    console.log("  Load /dashboard/billing to let the state machine run.");
  }

  const fresh = await prisma.subscription.findUnique({
    where: { userId: user.id },
    include: { plan: true },
  });
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  console.log("\n--- subscription ---");
  console.table([
    {
      plan: fresh.plan.name,
      status: fresh.status,
      method: fresh.method,
      autoRenew: fresh.autoRenew,
      trialEndsAt: fresh.trialEndsAt?.toISOString() ?? null,
      periodEnd: fresh.currentPeriodEnd.toISOString(),
      graceEndsAt: fresh.graceEndsAt?.toISOString() ?? null,
      attempts: fresh.renewalAttempts,
      version: fresh.version,
    },
  ]);

  console.log("--- last payments ---");
  console.table(
    payments.map((p) => ({
      status: p.status,
      kind: p.kind,
      amount: String(p.amount),
      method: p.method,
      periodEnd: p.periodEnd.toISOString().slice(0, 10),
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
