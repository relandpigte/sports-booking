// Exercises settleBookingPayment, the LostHold path and expireBookingHolds
// against the real database, then removes everything it created.
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { CRYPTO_PURPOSE, encrypt, secretHint } from "@/lib/crypto";
import {
  settleBookingPayment,
  expireBookingHolds,
  refundBookingPayment,
} from "@/lib/booking-payments";

import { ok, run } from "./harness";
import { installPaymongoMock, payMockSession } from "./paymongo-mock";

const mock = installPaymongoMock();
const prisma = new PrismaClient();

const DATE = "2099-12-31"; // far future: cannot collide with real data
const created = { bookings: [] as string[], payments: [] as string[] };

// The same predicate getBookedHours uses (holdingHourWhere in bookings.ts).
// Duplicated here rather than imported because that module pulls in the Next
// request context, which doesn't exist in a plain node script.
async function bookedHours(courtId: string): Promise<number[]> {
  const rows = await prisma.bookingSlot.findMany({
    where: {
      courtId,
      date: DATE,
      OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: new Date() } }],
    },
    select: { hour: true },
  });
  return rows.map((r) => r.hour).sort((a, b) => a - b);
}

async function scaffold(args: {
  courtId: string;
  hubId: string;
  partnerId: string;
  gatewayId: string;
  userId: string;
  hours: number[];
  holdExpiresAt: Date;
  paymentStatus: "PENDING" | "SUCCEEDED";
}) {
  // A paid fixture needs a session PayMongo will recognise: a refund resolves
  // the cs_ id to its pay_ id before it can call /refunds.
  const sessionId = `cs_${crypto.randomBytes(8).toString("hex")}`;
  if (args.paymentStatus === "SUCCEEDED") payMockSession(mock, sessionId);

  const payment = await prisma.bookingPayment.create({
    data: {
      partnerId: args.partnerId,
      gatewayId: args.gatewayId,
      userId: args.userId,
      hubId: args.hubId,
      amount: 100 * args.hours.length,
      method: "CARD",
      status: args.paymentStatus,
      expiresAt: args.holdExpiresAt,
      provider: "paymongo",
      providerPaymentId: args.paymentStatus === "SUCCEEDED" ? sessionId : null,
      paidAt: args.paymentStatus === "SUCCEEDED" ? new Date() : null,
      chargeStartedAt: args.paymentStatus === "SUCCEEDED" ? new Date() : null,
    },
  });
  created.payments.push(payment.id);

  const booking = await prisma.booking.create({
    data: {
      courtId: args.courtId,
      hubId: args.hubId,
      userId: args.userId,
      date: DATE,
      startHour: args.hours[0],
      endHour: args.hours[args.hours.length - 1] + 1,
      hours: args.hours.length,
      startsAt: new Date(`${DATE}T00:00:00.000Z`),
      endsAt: new Date(`${DATE}T01:00:00.000Z`),
      status: "PENDING",
      holdExpiresAt: args.holdExpiresAt,
      bookingPaymentId: payment.id,
      slots: {
        create: args.hours.map((hour) => ({
          courtId: args.courtId,
          date: DATE,
          hour,
          holdExpiresAt: args.holdExpiresAt,
        })),
      },
    },
  });
  created.bookings.push(booking.id);
  return { payment, booking };
}

async function main() {
  const court = await prisma.court.findFirst({
    select: { id: true, hubId: true, hub: { select: { ownerId: true } } },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  if (!court || !player) throw new Error("need a court and a player in the db");
  const partnerId = court.hub.ownerId;

  // Whatever real data already exists must be exactly what exists at the end.
  const baselinePayments = await prisma.bookingPayment.count();
  const baselineGateways = await prisma.partnerGateway.count();

  // Its OWN gateway on its OWN throwaway user. Reusing the partner's real row
  // was the earlier mistake here: PartnerGateway.userId is unique, and their
  // row may well be from a gateway this app no longer supports — which is a
  // clean refusal from refundBookingPayment, and nothing to do with settling.
  const gatewayOwner = await prisma.user.create({
    data: {
      role: "PARTNER",
      name: "check settle",
      email: "check-settle@example.test",
      passwordHash: "x",
    },
    select: { id: true },
  });
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: gatewayOwner.id,
      provider: "paymongo",
      publicKey: "pk_test_abcdefgh",
      secretKeyEnc: encrypt("sk_test_abcdefghij", CRYPTO_PURPOSE.gatewaySecretKey),
      webhookSecretEnc: encrypt(
        "whsec_abcdefghijklmnop",
        CRYPTO_PURPOSE.gatewayWebhookSecret
      ),
      secretKeyHint: secretHint("sk_test_abcdefghij"),
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
    select: { id: true },
  });

  const base = {
    courtId: court.id,
    hubId: court.hubId,
    partnerId,
    gatewayId: gateway.id,
    userId: player.id,
  };
  const future = new Date(Date.now() + 15 * 60_000);
  const past = new Date(Date.now() - 60_000);

  // --- 1. Happy path -------------------------------------------------------
  const a = await scaffold({
    ...base,
    hours: [8, 9],
    holdExpiresAt: future,
    paymentStatus: "SUCCEEDED",
  });
  const r1 = await settleBookingPayment(a.payment.id);
  ok("settle confirms", r1.status === "confirmed");
  const aBooking = await prisma.booking.findUnique({ where: { id: a.booking.id } });
  ok("booking is CONFIRMED", aBooking!.status === "CONFIRMED");
  ok("hold cleared on booking", aBooking!.holdExpiresAt === null);
  const aSlots = await prisma.bookingSlot.findMany({
    where: { bookingId: a.booking.id },
  });
  ok("slots kept", aSlots.length === 2);
  ok("hold cleared on slots", aSlots.every((s) => s.holdExpiresAt === null));

  // Idempotent from every leg.
  const r1b = await settleBookingPayment(a.payment.id);
  ok("settle is idempotent", r1b.status === "already");

  // --- 2. A payment that hasn't succeeded can't confirm anything -----------
  const b = await scaffold({
    ...base,
    hours: [10],
    holdExpiresAt: future,
    paymentStatus: "PENDING",
  });
  const r2 = await settleBookingPayment(b.payment.id);
  ok("unpaid does not settle", r2.status === "not-paid");
  ok(
    "unpaid booking untouched",
    (await prisma.booking.findUnique({ where: { id: b.booking.id } }))!.status ===
      "PENDING"
  );

  // --- 3. LostHold: the hours went to someone else while we were paying ----
  const c = await scaffold({
    ...base,
    hours: [12, 13],
    holdExpiresAt: past,
    paymentStatus: "SUCCEEDED",
  });
  // Simulate another player's reap taking one of the two hours.
  await prisma.bookingSlot.deleteMany({
    where: { bookingId: c.booking.id, hour: 13 },
  });
  const r3 = await settleBookingPayment(c.payment.id);
  ok("lost hold detected", r3.status === "lost");
  ok("lost hold auto-refunds", r3.status === "lost" && r3.refunded);
  const cBooking = await prisma.booking.findUnique({ where: { id: c.booking.id } });
  ok("lost booking is EXPIRED", cBooking!.status === "EXPIRED");
  ok(
    "lost booking releases its slots",
    (await prisma.bookingSlot.count({ where: { bookingId: c.booking.id } })) === 0
  );
  const cPayment = await prisma.bookingPayment.findUnique({
    where: { id: c.payment.id },
  });
  ok("payment refunded", cPayment!.status === "REFUNDED");
  ok("refund amount recorded", Number(cPayment!.refundedAmount) === 200);
  ok("refund reference recorded", cPayment!.refundRef != null);

  // Refunding twice is a no-op, not a second refund.
  const again = await refundBookingPayment({ paymentId: c.payment.id });
  ok("refund is idempotent", again.ok && again.alreadyRefunded);

  // --- 4. A live hold still blocks the grid; a dead one doesn't ------------
  const live = await scaffold({
    ...base,
    hours: [16],
    holdExpiresAt: future,
    paymentStatus: "PENDING",
  });
  const dead = await scaffold({
    ...base,
    hours: [17],
    holdExpiresAt: past,
    paymentStatus: "PENDING",
  });
  const booked = await bookedHours(court.id);
  ok("live hold blocks its hour", booked.includes(16));
  ok("dead hold does NOT block its hour", !booked.includes(17));
  ok("confirmed booking still blocks", booked.includes(8) && booked.includes(9));

  // --- 5. The sweep is hygiene: it changes rows, not availability ----------
  const before = await bookedHours(court.id);
  const swept = await expireBookingHolds();
  const after = await bookedHours(court.id);
  ok("sweep changes nothing visible", JSON.stringify(before) === JSON.stringify(after));
  ok("sweep expired the dead booking", swept.bookings >= 1);
  ok(
    "dead booking now reads EXPIRED",
    (await prisma.booking.findUnique({ where: { id: dead.booking.id } }))!.status ===
      "EXPIRED"
  );
  ok(
    "dead booking's slots are gone",
    (await prisma.bookingSlot.count({ where: { bookingId: dead.booking.id } })) === 0
  );
  ok(
    "dead payment is FAILED",
    (await prisma.bookingPayment.findUnique({ where: { id: dead.payment.id } }))!
      .status === "FAILED"
  );
  ok(
    "live hold survives the sweep",
    (await prisma.booking.findUnique({ where: { id: live.booking.id } }))!.status ===
      "PENDING"
  );
  ok(
    "live hold keeps its slot",
    (await prisma.bookingSlot.count({ where: { bookingId: live.booking.id } })) === 1
  );

  // --- 6. Confirmation racing the sweep never loses its slot ---------------
  // Hold the slot row so both operations queue behind us. Settlement queues
  // first; the sweep reads the expired PENDING candidate, then queues second.
  // Once released, settlement confirms it and cleanup must re-read that state
  // instead of deleting the slot from its stale candidate list.
  const race = await scaffold({
    ...base,
    hours: [18],
    holdExpiresAt: past,
    paymentStatus: "SUCCEEDED",
  });
  let releaseBlocker!: () => void;
  let reportLocked!: () => void;
  const release = new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  });
  const locked = new Promise<void>((resolve) => {
    reportLocked = resolve;
  });
  const blocker = prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "BookingSlot"
                       WHERE "bookingId" = ${race.booking.id}
                       FOR UPDATE`;
    reportLocked();
    await release;
  });
  await locked;

  const settling = settleBookingPayment(race.payment.id);
  await new Promise((resolve) => setTimeout(resolve, 75));
  const sweeping = expireBookingHolds();
  await new Promise((resolve) => setTimeout(resolve, 75));
  releaseBlocker();

  const [raceOutcome] = await Promise.all([settling, sweeping, blocker]);
  const raceBooking = await prisma.booking.findUnique({
    where: { id: race.booking.id },
  });
  ok("confirmation wins the queued race", raceOutcome.status === "confirmed");
  ok("racing booking stays CONFIRMED", raceBooking?.status === "CONFIRMED");
  ok(
    "racing confirmation keeps its slot",
    (await prisma.bookingSlot.count({ where: { bookingId: race.booking.id } })) === 1
  );

  // --- cleanup -------------------------------------------------------------
  await prisma.booking.deleteMany({ where: { id: { in: created.bookings } } });
  await prisma.bookingPayment.deleteMany({ where: { id: { in: created.payments } } });
  // Cascades to its gateway.
  await prisma.user.delete({ where: { id: gatewayOwner.id } });

  ok(
    "cleaned up bookings",
    (await prisma.booking.count({ where: { date: DATE } })) === 0
  );
  ok(
    "left real payments alone",
    (await prisma.bookingPayment.count()) === baselinePayments
  );
  ok(
    "left the real gateways alone",
    (await prisma.partnerGateway.count()) === baselineGateways
  );

}

void run(main, async () => {
  await prisma.$disconnect();
});
