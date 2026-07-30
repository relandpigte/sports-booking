// The admin collection DAL, against Postgres.
//
// admin-billing → billing → next/navigation, which can't load outside a
// request. So the two auth modules are replaced in the require cache BEFORE
// anything imports them: `requireAdmin` returns a real admin row and nothing
// else is faked. Every line of the money logic below is the real one.
import { createRequire } from "node:module";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";

const prisma = new PrismaClient();

const EMAIL = "tmp-logic@example.test";
const req = createRequire(import.meta.url);
const root = process.cwd();

function stub(modulePath: string, exports: Record<string, unknown>) {
  const id = path.join(root, modulePath);
  req.cache[id] = {
    id,
    filename: id,
    path: path.dirname(id),
    loaded: true,
    exports,
    children: [],
    paths: [],
  } as unknown as NodeModule;
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  const plan = await prisma.plan.findFirst({ orderBy: { priceMonthly: "asc" } });
  if (!admin || !plan) throw new Error("need an admin and a plan");

  // billing.ts imports redirect() at module scope, and next/navigation drags
  // in the client router — which needs a request context this has none of.
  // Nothing under test calls it.
  const navId = req.resolve("next/navigation");
  req.cache[navId] = {
    id: navId,
    filename: navId,
    path: path.dirname(navId),
    loaded: true,
    exports: {
      redirect: () => {
        throw new Error("unexpected redirect()");
      },
      notFound: () => {
        throw new Error("unexpected notFound()");
      },
    },
    children: [],
    paths: [],
  } as unknown as NodeModule;

  // The session is the only other thing a script genuinely cannot have.
  stub("src/lib/dal.ts", {
    requireRole: async () => admin,
    requirePartner: async () => admin,
    getViewer: async () => admin,
    getCurrentUser: async () => admin,
    verifySession: async () => ({ user: admin }),
  });
  stub("src/lib/admin.ts", { requireAdmin: async () => admin });

  const { recordOfflinePayment, compPeriod, listPartnerSubscriptions } =
    await import("@/lib/admin-billing");

  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const yesterday = new Date(Date.now() - 864e5);
  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      name: "Temp Venue",
      email: EMAIL,
      passwordHash: "x",
      subscription: {
        create: {
          planId: plan.id,
          status: "PAST_DUE",
          method: "GCASH",
          autoRenew: false,
          // No trial any more; the fixture is simply a period that has ended.
          trialEndsAt: null,
          currentPeriodStart: new Date(Date.now() - 15 * 864e5),
          currentPeriodEnd: yesterday,
          graceEndsAt: new Date(Date.now() + 6 * 864e5),
          provider: "paymongo",
        },
      },
    },
    select: { id: true },
  });
  // Service fees this fixture has collected for us: the thing an invoice is
  // now made of. Without them there is nothing to record or collect.
  const { grossFor, platformFeeFor } = await import("@/lib/constants");
  const court = await prisma.court.findFirst({ select: { id: true, hubId: true } });
  const anyPlayer = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_abcdefgh",
      secretKeyEnc: "x",
      webhookSecretEnc: "x",
      secretKeyHint: "…test",
      webhookToken: Math.random().toString(36).slice(2) + Date.now(),
    },
    select: { id: true },
  });
  if (!court || !anyPlayer) throw new Error("need a court and a player");
  await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: anyPlayer.id,
      hubId: court.hubId,
      amount: grossFor(1000),
      venueAmount: 1000,
      platformFee: platformFeeFor(1000),
      method: "GCASH",
      status: "SUCCEEDED",
      expiresAt: new Date(),
      provider: "paymongo",
      // Inside the period that just ended — which is what an invoice covers.
      paidAt: new Date(Date.now() - 5 * 864e5),
    },
  });
  const price = platformFeeFor(1000);
  // Whatever already exists must be exactly what exists at the end.
  const baselinePayments = await prisma.payment.count();
  const subOf = () =>
    prisma.subscription.findUnique({ where: { userId: partner.id } });

  // --- 1. What the admin sees ----------------------------------------------
  const { rows, summary } = await listPartnerSubscriptions();
  const row = rows.find((r) => r.userId === partner.id);
  ok("the partner is listed", row != null);
  // Owing nothing is now the normal state: joining is free, and this fixture
  // has taken no bookings, so there are no service fees to bill.
  ok("owes exactly the fees it collected", row?.amountDue === price);
  ok("their plan is named", row?.planName === plan.name);
  ok("no payments yet", row?.lastPayment === null);
  ok("counted as past due", summary.pastDue >= 1);
  ok("not yet active", row?.status !== "ACTIVE");

  // --- 2. Money that arrived by bank transfer ------------------------------
  const before = (await subOf())!;
  const recorded = await recordOfflinePayment({
    userId: partner.id,
    note: "BPI transfer ref 12345",
  });
  ok("offline payment recorded", recorded.ok);

  const after = (await subOf())!;
  ok("subscription is ACTIVE", after.status === "ACTIVE");
  ok("period moved forward", after.currentPeriodEnd > before.currentPeriodEnd);
  ok("grace cleared", after.graceEndsAt === null);

  const payments = await prisma.payment.findMany({
    where: { userId: partner.id },
    orderBy: { createdAt: "desc" },
  });
  ok("exactly one payment row", payments.length === 1);
  ok("recorded as MANUAL", payments[0].kind === "MANUAL");
  ok("marked SUCCEEDED", payments[0].status === "SUCCEEDED");
  ok("recorded the accrued fees, not a plan price", Number(payments[0].amount) === price);
  ok("the trail names the admin", payments[0].providerRef === `offline:${admin.email}`);
  ok("the note survives", payments[0].failureMessage?.includes("BPI") === true);

  // --- 3. The same period must not be credited twice -----------------------
  const twice = await recordOfflinePayment({ userId: partner.id });
  ok("a second recording is refused", !twice.ok);
  ok(
    "the period did not move again",
    (await subOf())!.currentPeriodEnd.getTime() === after.currentPeriodEnd.getTime()
  );
  ok(
    "and no second row was written",
    (await prisma.payment.count({ where: { userId: partner.id } })) === 1
  );

  // --- 4. Comping the next period ------------------------------------------
  await prisma.subscription.update({
    where: { userId: partner.id },
    data: { status: "PAST_DUE", currentPeriodEnd: yesterday },
  });
  ok("comp applied", (await compPeriod({ userId: partner.id, note: "launch partner" })).ok);

  const compRow = await prisma.payment.findFirst({
    where: { userId: partner.id, kind: "COMP" },
  });
  ok("a COMP row was written", compRow != null);
  ok("at zero pesos", Number(compRow!.amount) === 0);
  ok("marked SUCCEEDED", compRow!.status === "SUCCEEDED");
  ok("the trail names the admin", compRow!.providerRef === `comp:${admin.email}`);
  ok("the partner is active again", (await subOf())!.status === "ACTIVE");
  ok(
    "comping twice is refused too",
    !(await compPeriod({ userId: partner.id })).ok
  );

  // --- 5. The list reflects it ---------------------------------------------
  const relisted = await listPartnerSubscriptions();
  const relistedRow = relisted.rows.find((r) => r.userId === partner.id);
  ok("now shows as paid up", relistedRow?.amountDue === null);
  ok("last payment surfaced", relistedRow?.lastPayment?.kind === "COMP");
  ok("entitled again", relistedRow?.entitled === true);
  ok(
    "and is active again",
    relistedRow?.status === "ACTIVE"
  );

  // --- 6. Nothing was written outside this fixture --------------------------
  ok(
    "no rows written outside the fixture",
    (await prisma.payment.count({ where: { userId: { not: partner.id } } })) ===
      baselinePayments
  );

  await prisma.bookingPayment.deleteMany({ where: { partnerId: partner.id } });
  await prisma.user.delete({ where: { id: partner.id } });
  ok(
    "cleaned up",
    (await prisma.user.count({ where: { email: EMAIL } })) === 0
  );
  ok(
    "payments cascaded away",
    (await prisma.payment.count({ where: { userId: partner.id } })) === 0
  );

}

void run(main, async () => {
  await prisma.$disconnect();
});
