import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Default admin account. Credentials come from the environment (.env) so they
// are never committed. Falls back to a placeholder you must change.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "ChangeMe123!";

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: "ADMIN", passwordHash },
    create: {
      email: ADMIN_EMAIL,
      name: "Admin",
      playerName: "admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  console.log(`✓ Admin ready: ${admin.email} (role ${admin.role})`);

  await seedPlans();
  await grandfatherExistingPartners();
}

// The three subscription tiers. Gated on the TOTAL court count across all of a
// partner's hubs; hubs themselves are unlimited on every tier.
const PLANS = [
  {
    key: "STARTER",
    name: "Starter",
    blurb: "For a single venue finding its feet.",
    priceMonthly: 499,
    maxCourts: 3,
    sortOrder: 1,
  },
  {
    key: "PRO",
    name: "Pro",
    blurb: "For a growing club with several courts.",
    priceMonthly: 1499,
    maxCourts: 12,
    sortOrder: 2,
  },
  {
    key: "ELITE",
    name: "Elite",
    blurb: "Unlimited courts across unlimited hubs.",
    priceMonthly: 2999,
    maxCourts: null,
    sortOrder: 3,
  },
];

async function seedPlans() {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      // Re-running the seed re-asserts pricing and limits, but never touches
      // anyone's subscription.
      update: {
        name: plan.name,
        blurb: plan.blurb,
        priceMonthly: plan.priceMonthly,
        maxCourts: plan.maxCourts,
        sortOrder: plan.sortOrder,
        active: true,
      },
      create: plan,
    });
  }
  console.log(`✓ Plans ready: ${PLANS.map((p) => p.key).join(", ")}`);
}

// Partners that predate billing have no Subscription row — and the public
// listing filter requires one to EXIST, so without this their hubs would vanish
// from /hubs the moment this ships.
//
// They get a comped 12-month ACTIVE period. Joining is free now and there is no
// trial at all, but the long period is kept so a backfilled partner is never
// the first to discover a billing edge.
// autoRenew stays false so the state machine never tries to charge a card that
// was never given.
async function grandfatherExistingPartners() {
  const partners = await prisma.user.findMany({
    where: { role: "PARTNER", subscription: null },
    select: { id: true, email: true },
  });
  if (partners.length === 0) {
    console.log("✓ No partners needed grandfathering");
    return;
  }

  const plans = await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  const byKey = Object.fromEntries(plans.map((p) => [p.key, p]));

  for (const partner of partners) {
    const courts = await prisma.court.count({
      where: { hub: { ownerId: partner.id } },
    });
    // Put them on the smallest tier that actually fits what they already run.
    const plan =
      courts <= 3 ? byKey.STARTER : courts <= 12 ? byKey.PRO : byKey.ELITE;

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);

    const subscription = await prisma.subscription.create({
      data: {
        userId: partner.id,
        planId: plan.id,
        status: "ACTIVE",
        method: "CARD",
        autoRenew: false,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        provider: "manual",
      },
    });

    await prisma.payment.create({
      data: {
        subscriptionId: subscription.id,
        userId: partner.id,
        planId: plan.id,
        kind: "COMP",
        amount: 0,
        method: "CARD",
        status: "SUCCEEDED",
        periodStart: now,
        periodEnd,
        paidAt: now,
        idempotencyKey: `comp:${subscription.id}`,
      },
    });

    console.log(
      `✓ Grandfathered ${partner.email} onto ${plan.name} (${courts} courts) until ${periodEnd.toISOString().slice(0, 10)}`
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
