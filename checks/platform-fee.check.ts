// The service fee: the arithmetic, and the ledger it feeds.
//
//   npm run check:fee
//
// Two things have to hold or somebody is short-changed. The fee a player is
// quoted on the grid must be the fee stored on the payment must be the fee the
// venue is invoiced — one function, three surfaces. And a refunded booking must
// disappear from the accrual, because we did not keep that money either.
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  PLATFORM_FEE_RATE,
  grossFor,
  platformFeeFor,
} from "@/lib/constants";

const prisma = new PrismaClient();
const EMAIL = "check-fee-partner@example.test";

async function check() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Seed an admin user first.");
  stubRequestContext(admin);

  const { accruedFees } = await import("@/lib/billing");

  // --- 1. The arithmetic ----------------------------------------------------
  ok("the rate is 5%", PLATFORM_FEE_RATE === 0.05);
  ok("a ₱500 booking carries a ₱25 fee", platformFeeFor(500) === 25);
  ok("and grosses ₱525", grossFor(500) === 525);
  ok("a ₱250 hour carries ₱12.50", platformFeeFor(250) === 12.5);
  ok("and grosses ₱262.50", grossFor(250) === 262.5);
  ok("a ₱200 hour carries ₱10", platformFeeFor(200) === 10);

  // Rounding: pesos are decimal, floats are not. 333.33 × 0.05 = 16.6665,
  // which must land on a centavo rather than drifting.
  ok("₱333.33 rounds to ₱16.67", platformFeeFor(333.33) === 16.67);
  ok("and grosses exactly ₱350", grossFor(333.33) === 350);
  ok("₱1 rounds to ₱0.05", platformFeeFor(1) === 0.05);
  ok("₱0.10 rounds to ₱0.01", platformFeeFor(0.1) === 0.01);
  ok("a free court has no fee", platformFeeFor(0) === 0);

  // The invariant that matters: the split always reconstitutes the gross.
  const drifted: number[] = [];
  for (let peso = 1; peso <= 5000; peso++) {
    if (Math.abs(peso + platformFeeFor(peso) - grossFor(peso)) > 1e-9) {
      drifted.push(peso);
    }
  }
  ok(
    "court + fee === gross for every whole peso to ₱5,000",
    drifted.length === 0
  );

  // --- 2. The ledger --------------------------------------------------------
  const court = await prisma.court.findFirst({
    select: { id: true, hubId: true },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  if (!court || !player) throw new Error("Seed a hub with a court and a player.");

  const baseline = await prisma.bookingPayment.count();

  const partner = await prisma.user.create({
    data: { role: "PARTNER", name: "fee check", email: EMAIL, passwordHash: "x" },
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
      webhookToken: crypto.randomBytes(16).toString("base64url"),
    },
    select: { id: true },
  });

  const pay = (courtTotal: number, opts: { paidAt?: Date; refunded?: boolean } = {}) =>
    prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        gatewayId: gateway.id,
        userId: player.id,
        hubId: court.hubId,
        amount: grossFor(courtTotal),
        venueAmount: courtTotal,
        platformFee: platformFeeFor(courtTotal),
        method: "GCASH",
        status: opts.refunded ? "REFUNDED" : "SUCCEEDED",
        expiresAt: new Date(),
        provider: "paymongo",
        paidAt: opts.paidAt ?? new Date("2026-06-15T04:00:00Z"),
        refundedAt: opts.refunded ? new Date("2026-06-16T04:00:00Z") : null,
        refundedAmount: opts.refunded ? grossFor(courtTotal) : null,
      },
      select: { id: true },
    });

  const first = await pay(500);
  const stored = await prisma.bookingPayment.findUnique({
    where: { id: first.id },
  });
  ok("the gross is what the player pays", Number(stored!.amount) === 525);
  ok("the venue's share is the court total", Number(stored!.venueAmount) === 500);
  ok("our share is the fee", Number(stored!.platformFee) === 25);
  ok(
    "and the three reconcile in the database, not just in JS",
    Number(stored!.venueAmount) + Number(stored!.platformFee) ===
      Number(stored!.amount)
  );

  // --- 3. The accrual — what the venue gets invoiced ------------------------
  const june = {
    from: new Date("2026-06-01T00:00:00+08:00"),
    to: new Date("2026-07-01T00:00:00+08:00"),
  };

  await pay(250);
  ok(
    "the accrual is the sum of the fees",
    (await accruedFees(partner.id, june.from, june.to)) === 37.5
  );

  // A refunded booking earned us nothing.
  await pay(1000, { refunded: true });
  ok(
    "a refunded payment is excluded",
    (await accruedFees(partner.id, june.from, june.to)) === 37.5
  );

  // A payment still awaiting the player isn't money yet.
  await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: player.id,
      hubId: court.hubId,
      amount: grossFor(800),
      venueAmount: 800,
      platformFee: platformFeeFor(800),
      method: "CARD",
      status: "PENDING",
      expiresAt: new Date(),
      provider: "paymongo",
    },
  });
  ok(
    "a PENDING payment is excluded",
    (await accruedFees(partner.id, june.from, june.to)) === 37.5
  );

  // The period boundary, in Manila. 2026-06-30T16:30Z is 1 July 00:30 here, so
  // it belongs to July's invoice — the same class of bug the analytics check
  // guards, now on the money we bill for.
  await pay(400, { paidAt: new Date("2026-06-30T16:30:00Z") });
  ok(
    "a payment after Manila midnight is NOT in June",
    (await accruedFees(partner.id, june.from, june.to)) === 37.5
  );
  ok(
    "it is in July",
    (await accruedFees(
      partner.id,
      new Date("2026-07-01T00:00:00+08:00"),
      new Date("2026-08-01T00:00:00+08:00")
    )) === 20
  );

  // Another partner's fees are never ours to bill.
  ok(
    "the accrual is scoped to one partner",
    (await accruedFees(player.id, june.from, june.to)) === 0
  );

  // --- 4. The venue's report shows the court amount, not the gross ----------
  const { venueRevenue, monthRange } = await import("@/lib/analytics");
  const report = await venueRevenue({
    partnerId: partner.id,
    range: monthRange(2026, 6),
  });
  ok(
    "the venue's revenue excludes our fee",
    report.totals.gross === 500 + 250 + 1000
  );
  ok(
    "and the refund comes off at the venue's share, not the gross",
    report.totals.refunds === 1000
  );

  await cleanup();
  ok(
    "the real payments are untouched",
    (await prisma.bookingPayment.count()) === baseline
  );
}

async function cleanup() {
  const partner = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true },
  });
  if (!partner) return;
  await prisma.bookingPayment.deleteMany({ where: { partnerId: partner.id } });
  await prisma.user.delete({ where: { id: partner.id } });
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
