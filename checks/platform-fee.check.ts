// The service fee: the arithmetic, and the ledger it feeds.
//
//   npm run check:fee
//
// The fee quoted to a player must be the fee stored on the payment and reported
// to admins. Refunded payments must continue to count as retained service fees.
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  BOOKING_SERVICE_FEE,
  EVENT_PAYMENT_FEE_PER_PLAYER,
  TRAINER_SERVICE_FEE,
  bookingServiceFeeFor,
  eventGrossFor,
  eventPaymentFeeFor,
  grossFor,
  paymongoQrPhProcessingCostFor,
  paymongoQrPhProcessingFeeFor,
  paymongoQrPhTotalFor,
  trainerServiceFeeFor,
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
  ok("the court service fee is a flat ₱25", BOOKING_SERVICE_FEE === 25);
  ok("an empty court total has no fee", bookingServiceFeeFor(0) === 0);
  ok("a ₱250 court total carries the ₱25 fee", bookingServiceFeeFor(250) === 25);
  ok(
    "a ₱5,000 multi-court checkout still carries one ₱25 fee",
    bookingServiceFeeFor(5_000) === 25
  );
  ok("the trainer service fee is a flat ₱25", TRAINER_SERVICE_FEE === 25);
  ok(
    "an automatic trainer session carries the ₱25 fee",
    trainerServiceFeeFor(500, "AUTOMATIC") === 25
  );
  ok(
    "a manual trainer session is fee-free",
    trainerServiceFeeFor(500, "MANUAL") === 0
  );
  ok(
    "a trainer session with nothing to pay has no fee",
    trainerServiceFeeFor(0, "AUTOMATIC") === 0
  );
  ok("the event payment fee is ₱5 per player", EVENT_PAYMENT_FEE_PER_PLAYER === 5);
  ok("free events have no payment fee", eventPaymentFeeFor(0) === 0);
  ok("one paid event spot carries a ₱5 fee", eventPaymentFeeFor(1) === 5);
  ok("three paid event spots carry a ₱15 fee", eventPaymentFeeFor(3) === 15);
  ok("a one-player ₱80 event checkout totals ₱85", eventGrossFor(80, 1) === 85);
  ok("a one-player ₱100 event checkout totals ₱105", eventGrossFor(100, 1) === 105);
  ok("a one-player ₱150 event checkout totals ₱155", eventGrossFor(150, 1) === 155);
  ok(
    "the ₱80 event leaves ₱3.72 after PayMongo processing",
    Math.abs(
      eventPaymentFeeFor(1) - paymongoQrPhProcessingCostFor(85) - 3.72
    ) < 1e-9
  );
  ok(
    "the ₱100 event leaves ₱3.42 after PayMongo processing",
    Math.abs(
      eventPaymentFeeFor(1) - paymongoQrPhProcessingCostFor(105) - 3.42
    ) < 1e-9
  );
  ok(
    "the ₱150 event leaves ₱2.67 after PayMongo processing",
    Math.abs(
      eventPaymentFeeFor(1) - paymongoQrPhProcessingCostFor(155) - 2.67
    ) < 1e-9
  );
  ok("a ₱250 booking totals ₱275", grossFor(250) === 275);
  ok("a ₱500 booking totals ₱525", grossFor(500) === 525);
  ok("a free selection totals nothing", grossFor(0) === 0);
  ok(
    "a centavo court total stays exact",
    grossFor(333.33) === 358.33
  );
  // Historical player-paid rows still gross up the processing fee.
  ok(
    "a ₱257.50 subtotal carries the approved ₱3.92 QR Ph fee",
    paymongoQrPhProcessingFeeFor(257.5) === 3.92
  );
  ok(
    "the exact QR amount is ₱261.42",
    paymongoQrPhTotalFor(257.5) === 261.42
  );

  // Bunal.club absorbs PayMongo's cut out of the flat fee. That is a margin on
  // an ordinary booking and a loss on a large one — pinned here so a change
  // to either number is a deliberate decision, not a surprise.
  ok(
    "the flat fee covers processing on a ₱500 booking",
    BOOKING_SERVICE_FEE - paymongoQrPhProcessingCostFor(grossFor(500)) > 0
  );
  ok(
    "the flat fee does NOT cover processing on a ₱2,000 booking",
    BOOKING_SERVICE_FEE - paymongoQrPhProcessingCostFor(grossFor(2_000)) < 0
  );

  // The invariant that matters: the split always reconstitutes the total.
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
    "court total + flat fee === checkout total across booking totals",
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
  const pay = (
    courtTotal: number,
    hours: number,
    opts: { paidAt?: Date; refunded?: boolean } = {}
  ) =>
    prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        collectedBy: "PLATFORM",
        userId: player.id,
        hubId: court.hubId,
        amount: grossFor(courtTotal),
        venueAmount: courtTotal,
        platformFee: bookingServiceFeeFor(courtTotal),
        method: "QRPH",
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
  ok("the total is what the player pays", Number(stored!.amount) === 525);
  ok("the venue's share is the court total", Number(stored!.venueAmount) === 500);
  ok("our share is the flat fee", Number(stored!.platformFee) === 25);
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
      collectedBy: "PLATFORM",
      userId: player.id,
      hubId: court.hubId,
      amount: grossFor(800),
      venueAmount: 800,
      platformFee: bookingServiceFeeFor(800),
      method: "QRPH",
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
    marketplace.serviceFees >= 75
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
