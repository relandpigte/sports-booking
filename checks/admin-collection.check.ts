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
          trialEndsAt: yesterday,
          currentPeriodStart: new Date(Date.now() - 15 * 864e5),
          currentPeriodEnd: yesterday,
          graceEndsAt: new Date(Date.now() + 6 * 864e5),
          provider: "paymongo",
        },
      },
    },
    select: { id: true },
  });
  const price = plan.priceMonthly.toNumber();
  // Whatever already exists must be exactly what exists at the end.
  const baselinePayments = await prisma.payment.count();
  const subOf = () =>
    prisma.subscription.findUnique({ where: { userId: partner.id } });

  // --- 1. What the admin sees ----------------------------------------------
  const { rows, summary } = await listPartnerSubscriptions();
  const row = rows.find((r) => r.userId === partner.id);
  ok("the partner is listed", row != null);
  ok("shown as owing the plan price", row?.amountDue === price);
  ok("their plan is named", row?.planName === plan.name);
  ok("no payments yet", row?.lastPayment === null);
  ok("counted as past due", summary.pastDue >= 1);
  ok("not counted in MRR while unpaid", row?.status !== "ACTIVE");

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
  ok("charged the plan price", Number(payments[0].amount) === price);
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
    "and now counts toward MRR",
    relisted.summary.mrr >= price && relistedRow?.status === "ACTIVE"
  );

  // --- 6. Nothing was written outside this fixture --------------------------
  ok(
    "no rows written outside the fixture",
    (await prisma.payment.count({ where: { userId: { not: partner.id } } })) ===
      baselinePayments
  );

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
