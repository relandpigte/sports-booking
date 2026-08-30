// The service fee: the arithmetic, and the ledger it feeds.
//
//   npm run check:fee
//
// The fee quoted to a player must be the fee stored on the payment and reported
// to admins. Refunded payments must continue to count as retained service fees.
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  SERVICE_FEE_PERCENT,
  SERVICE_FEE_RATE,
  bookingServiceFeeFor,
  grossFor,
  paymongoQrPhProcessingFeeFor,
  paymongoQrPhTotalFor,
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

  // --- 1. The arithmetic ----------------------------------------------------
  ok("the service-fee rate is 3%", SERVICE_FEE_RATE === 0.03);
  ok("the display percentage is 3", SERVICE_FEE_PERCENT === 3);
  ok("an empty court total has no fee", bookingServiceFeeFor(0) === 0);
  ok("a ₱250 court total carries a ₱7.50 fee", bookingServiceFeeFor(250) === 7.5);
  ok("a ₱500 court total carries a ₱15 fee", bookingServiceFeeFor(500) === 15);
  ok(
    "half-cent percentage results round to the nearest centavo",
    bookingServiceFeeFor(33.5) === 1.01
  );
  ok("a ₱250 booking grosses ₱257.50", grossFor(250) === 257.5);
  ok("a ₱500 booking grosses ₱515", grossFor(500) === 515);
  ok(
    "a ₱257.50 subtotal carries the approved ₱3.92 QR Ph fee",
    paymongoQrPhProcessingFeeFor(257.5) === 3.92
  );
  ok(
    "the exact QR amount is ₱261.42",
    paymongoQrPhTotalFor(257.5) === 261.42
  );
  ok(
    "a centavo court total stays exact",
    grossFor(333.33) === 343.33
  );

  // The invariant that matters: the split always reconstitutes the gross.
  const drifted: number[] = [];
  for (let peso = 1; peso <= 5000; peso++) {
    if (
      Math.abs(
        peso + bookingServiceFeeFor(peso) - grossFor(peso)
      ) > 1e-9
    ) {
      drifted.push(peso);
    }
  }
  ok(
    "court + 3% fee === gross across booking totals",
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

  const pay = (
    courtTotal: number,
    hours: number,
    opts: { paidAt?: Date; refunded?: boolean } = {}
  ) =>
    prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        gatewayId: gateway.id,
        userId: player.id,
        hubId: court.hubId,
        amount: grossFor(courtTotal),
        venueAmount: courtTotal,
        platformFee: bookingServiceFeeFor(courtTotal),
        method: "GCASH",
        status: opts.refunded ? "REFUNDED" : "SUCCEEDED",
        expiresAt: new Date(),
        provider: "paymongo",
        paidAt: opts.paidAt ?? new Date("2026-06-15T04:00:00Z"),
        refundedAt: opts.refunded ? new Date("2026-06-16T04:00:00Z") : null,
        refundedAmount: opts.refunded ? courtTotal : null,
      },
      select: { id: true },
    });

  const first = await pay(500, 1);
  const stored = await prisma.bookingPayment.findUnique({
    where: { id: first.id },
  });
  ok("the gross is what the player pays", Number(stored!.amount) === 515);
  ok("the venue's share is the court total", Number(stored!.venueAmount) === 500);
  ok("our share is the fee", Number(stored!.platformFee) === 15);
  ok(
    "and the three reconcile in the database, not just in JS",
    Number(stored!.venueAmount) + Number(stored!.platformFee) ===
      Number(stored!.amount)
  );

  await pay(250, 2);
  await pay(1000, 4, { refunded: true });

  // A payment still awaiting the player is not revenue.
  await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: player.id,
      hubId: court.hubId,
      amount: grossFor(800),
      venueAmount: 800,
      platformFee: bookingServiceFeeFor(800),
      method: "CARD",
      status: "PENDING",
      expiresAt: new Date(),
      provider: "paymongo",
    },
  });
  // --- 3. Reports keep venue and platform shares separate -------------------
  const { marketplaceRevenue, venueRevenue, monthRange } =
    await import("@/lib/analytics");
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
  const marketplace = await marketplaceRevenue(monthRange(2026, 6));
  ok(
    "admin reporting retains the service fee from refunded payments",
    marketplace.serviceFees >= 52.5
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
