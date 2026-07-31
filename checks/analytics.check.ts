// The revenue series against Postgres. The interesting cases are all about
// WHEN money is counted: Manila days vs UTC instants, and refunds landing on
// the day they were issued rather than the day of the sale.
import { createRequire } from "node:module";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import { bookingServiceFeeFor, grossFor } from "@/lib/constants";

const prisma = new PrismaClient();

const req = createRequire(import.meta.url);
const root = process.cwd();
const HUB = "tmp-analytics-hub";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("need an admin");

  // analytics → admin → dal → next/navigation, which needs a request context.
  const navId = req.resolve("next/navigation");
  req.cache[navId] = {
    id: navId,
    filename: navId,
    path: path.dirname(navId),
    loaded: true,
    exports: { redirect: () => {}, notFound: () => {} },
    children: [],
    paths: [],
  } as unknown as NodeModule;
  const adminId = path.join(root, "src/lib/admin.ts");
  req.cache[adminId] = {
    id: adminId,
    filename: adminId,
    path: path.dirname(adminId),
    loaded: true,
    exports: { requireAdmin: async () => admin },
    children: [],
    paths: [],
  } as unknown as NodeModule;

  const { venueRevenue, marketplaceRevenue, monthRange, monthsRange } =
    await import("@/lib/analytics");
  const { manilaDateOf } = await import("@/lib/time");

  const [partnerA, partnerB] = await prisma.user.findMany({
    where: { role: { in: ["PARTNER", "ADMIN"] } },
    take: 2,
    select: { id: true },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  const gateway = await prisma.partnerGateway.findFirst({ select: { id: true } });
  if (!partnerA || !partnerB || !player || !gateway) {
    throw new Error("need two partners, a player and a gateway");
  }

  const baselineBookingPayments = await prisma.bookingPayment.count();

  const make = (args: {
    partnerId: string;
    amount: number;
    paidAt: Date | null;
    refundedAt?: Date;
    refundedAmount?: number;
    hubId?: string;
  }) =>
    prisma.bookingPayment.create({
      data: {
        partnerId: args.partnerId,
        gatewayId: gateway.id,
        userId: player.id,
        hubId: args.hubId ?? HUB,
        // A venue's report is about the COURT amount, so the fixture carries
        // the split a real payment now has: the player paid the gross, the
        // venue keeps `amount`.
        amount: grossFor(args.amount, 1),
        venueAmount: args.amount,
        platformFee: bookingServiceFeeFor(1),
        method: "CARD",
        status: args.refundedAt ? "REFUNDED" : "SUCCEEDED",
        expiresAt: new Date(),
        provider: "paymongo",
        paidAt: args.paidAt,
        refundedAt: args.refundedAt ?? null,
        refundedAmount:
          args.refundedAmount != null ? grossFor(args.refundedAmount, 1) : null,
      },
      select: { id: true },
    });

  // --- The timezone case ----------------------------------------------------
  // 2026-06-15T23:30:00Z is 2026-06-16 07:30 in Manila. Bucketing on the raw
  // instant would file this under the 15th.
  const lateNightUtc = new Date("2026-06-15T23:30:00.000Z");
  ok(
    "the fixture really does straddle the date line",
    manilaDateOf(lateNightUtc) === "2026-06-16"
  );
  await make({ partnerId: partnerA.id, amount: 1000, paidAt: lateNightUtc });

  // And the mirror: 16:30Z is still the same Manila day (00:30 on the 17th)…
  await make({
    partnerId: partnerA.id,
    amount: 500,
    paidAt: new Date("2026-06-16T16:30:00.000Z"),
  });

  const june = await venueRevenue({
    partnerId: partnerA.id,
    range: monthRange(2026, 6),
  });
  const on15 = june.points.find((p) => p.bucket === "2026-06-15")!;
  const on16 = june.points.find((p) => p.bucket === "2026-06-16")!;
  const on17 = june.points.find((p) => p.bucket === "2026-06-17")!;
  ok("a 23:30 UTC payment lands on the NEXT Manila day", on16.gross === 1000);
  ok("and not on the UTC day", on15.gross === 0);
  ok("a 16:30 UTC payment lands on the following Manila day", on17.gross === 500);

  // --- Dense buckets --------------------------------------------------------
  ok("june has one bucket per day", june.points.length === 30);
  ok("the first is the 1st", june.points[0].bucket === "2026-06-01");
  ok("the last is the 30th", june.points[29].bucket === "2026-06-30");
  ok("empty days are zeros, not gaps", june.points[0].gross === 0);
  ok("labels are human", on16.label === "Jun 16");
  ok("totals add up", june.totals.gross === 1500);
  ok("two payments counted", june.totals.count === 2);
  ok(
    "the average ignores empty days",
    june.totals.average === 750 // 1500 over the 2 days with money, not over 30
  );

  // --- Refunds land on their own date --------------------------------------
  // Sold in June, refunded in July.
  await make({
    partnerId: partnerA.id,
    amount: 800,
    paidAt: new Date("2026-06-20T04:00:00.000Z"),
    refundedAt: new Date("2026-07-03T04:00:00.000Z"),
    refundedAmount: 800,
  });

  const june2 = await venueRevenue({
    partnerId: partnerA.id,
    range: monthRange(2026, 6),
  });
  ok("June still shows the sale", june2.totals.gross === 2300);
  ok("June is NOT reduced by a July refund", june2.totals.refunds === 0);
  ok("so June's net is untouched", june2.totals.net === 2300);

  const july = await venueRevenue({
    partnerId: partnerA.id,
    range: monthRange(2026, 7),
  });
  ok("July carries the refund", july.totals.refunds === 800);
  ok("July's net goes negative", july.totals.net === -800);
  ok(
    "on the day it was issued",
    july.points.find((p) => p.bucket === "2026-07-03")!.refunds === 800
  );

  // --- Grains agree ---------------------------------------------------------
  const byMonth = await venueRevenue({
    partnerId: partnerA.id,
    range: monthsRange(2026, 7, 2),
  });
  ok("the month grain has two buckets", byMonth.points.length === 2);
  ok("labelled by month", byMonth.points[1].label.startsWith("Jul"));
  ok(
    "month gross equals the sum of the day grains",
    byMonth.totals.gross === june2.totals.gross + july.totals.gross
  );
  ok(
    "month refunds equal the sum of the day grains",
    byMonth.totals.refunds === june2.totals.refunds + july.totals.refunds
  );

  // --- One partner never sees another's money ------------------------------
  await make({
    partnerId: partnerB.id,
    amount: 9999,
    paidAt: new Date("2026-06-10T04:00:00.000Z"),
  });
  const aAgain = await venueRevenue({
    partnerId: partnerA.id,
    range: monthRange(2026, 6),
  });
  ok("partner A's total is unchanged", aAgain.totals.gross === 2300);
  ok(
    "partner B's money is B's",
    (await venueRevenue({ partnerId: partnerB.id, range: monthRange(2026, 6) }))
      .totals.gross === 9999
  );
  ok(
    "the marketplace view sees both",
    (await marketplaceRevenue(monthRange(2026, 6))).totals.gross >= 2300 + 9999
  );

  // --- A hub filter, and a quiet period ------------------------------------
  const otherHub = await venueRevenue({
    partnerId: partnerA.id,
    hubId: "some-other-hub",
    range: monthRange(2026, 6),
  });
  ok("a hub with no payments is empty", otherHub.totals.gross === 0);
  ok("but still renders a full month", otherHub.points.length === 30);

  const quiet = await venueRevenue({
    partnerId: partnerA.id,
    range: monthRange(2025, 1),
  });
  ok("a month before any payments is all zeros", quiet.totals.gross === 0);
  ok("with 31 dense buckets", quiet.points.length === 31);
  ok("and an average of zero, not NaN", quiet.totals.average === 0);

  // --- cleanup --------------------------------------------------------------
  await prisma.bookingPayment.deleteMany({
    where: { OR: [{ hubId: HUB }, { hubId: "some-other-hub" }] },
  });
  ok(
    "left the real payments alone",
    (await prisma.bookingPayment.count()) === baselineBookingPayments
  );

}

void run(main, async () => {
  await prisma.$disconnect();
});
