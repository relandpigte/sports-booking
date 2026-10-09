// A player paying through Bunal.club's OWN PayMongo account — the rail every
// new automatic payment takes — end to end against Postgres, with PayMongo
// mocked at the network boundary.
//
//   npm run check:platform-collection
//
// What it is really guarding: that the platform account (and no venue's) is
// charged and refunded, that a settled payment makes Bunal.club owe the venue
// its share instead of making the venue owe a fee, that one webhook route
// cannot be tricked into settling a payment another account took, and that a
// refund reaches PayMongo once however many requests ask for it.
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import {
  CHECK_PLATFORM_SECRET_KEY,
  CHECK_PLATFORM_WEBHOOK_SECRET,
  enablePlatformCollection,
  ok,
  run,
} from "./harness";
import {
  installPaymongoMock,
  mockPaidEvent,
  mockPaymentPaidEvent,
  mockPaymentRefundedEvent,
  payMockIntent,
  requestsFor,
} from "./paymongo-mock";
import { BOOKING_HOLD_MINUTES, grossFor } from "@/lib/constants";

const prisma = new PrismaClient();

// Far future: a fixture can never collide with a real booking.
const DATE = "2099-12-26";
const PARTNER_EMAIL = "check-platform-partner@example.test";
const LEGACY_SECRET = `sk_test_${crypto.randomBytes(10).toString("hex")}`;

async function check() {
  process.env.APP_URL = "https://checks.bunal.club";
  enablePlatformCollection();
  const mock = installPaymongoMock();

  // Imported after the mock is installed, so nothing captures the real fetch.
  const { CRYPTO_PURPOSE, encrypt, secretHint } = await import("@/lib/crypto");
  const {
    cancelAutomaticBookingHold,
    chargeBookingPayment,
    pollBookingPayment,
    refundBookingPayment,
  } = await import("@/lib/booking-payments");
  const { readPlatformPaymongoWebhook } = await import(
    "@/lib/payments/paymongo-platform"
  );
  const { signPaymongoBody } = await import("@/lib/payments/paymongo-core");
  const { handlePlatformPaymentEvent } = await import("@/lib/platform-webhook");
  const { getPlatformCollectionStatus } = await import("@/lib/platform-gateway");

  const court = await prisma.court.findFirst({
    select: { id: true, hubId: true },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  if (!court || !player) {
    throw new Error("Seed a hub with a court and a player first.");
  }

  await cleanup();
  const baselinePayments = await prisma.bookingPayment.count();

  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      name: "Platform Collection Check",
      email: PARTNER_EMAIL,
      passwordHash: "x",
    },
    select: { id: true },
  });
  // The venue ALSO has its own PayMongo account on file from before the
  // cutover. Nothing on the platform rail may ever touch it.
  const legacyGateway = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_legacyvenue",
      secretKeyEnc: encrypt(LEGACY_SECRET, CRYPTO_PURPOSE.gatewaySecretKey),
      webhookSecretEnc: encrypt(
        "whsk_legacy_venue_secret",
        CRYPTO_PURPOSE.gatewayWebhookSecret
      ),
      secretKeyHint: secretHint(LEGACY_SECRET),
      webhookToken: crypto.randomBytes(24).toString("base64url"),
      // Already upgraded, so loading it never re-registers a webhook.
      webhookVersion: 2,
    },
    select: { id: true },
  });

  // A platform-collected checkout exactly as createBookingAction writes it.
  async function scaffold(hours: number[]) {
    const expiresAt = new Date(Date.now() + BOOKING_HOLD_MINUTES * 60_000);
    const venueAmount = 250 * hours.length;
    const payment = await prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        gatewayId: null,
        collectedBy: "PLATFORM",
        userId: player!.id,
        hubId: court!.hubId,
        amount: grossFor(venueAmount),
        venueAmount,
        platformFee: grossFor(venueAmount) - venueAmount,
        processingFeeResponsibility: "BUNAL",
        method: "QRPH",
        collectionMode: "AUTOMATIC",
        environment: "TEST",
        status: "PENDING",
        expiresAt,
        provider: "paymongo",
      },
      select: { id: true },
    });
    const booking = await prisma.booking.create({
      data: {
        courtId: court!.id,
        hubId: court!.hubId,
        userId: player!.id,
        date: DATE,
        startHour: hours[0],
        endHour: hours[hours.length - 1] + 1,
        hours: hours.length,
        startsAt: new Date(`${DATE}T00:00:00.000Z`),
        endsAt: new Date(`${DATE}T01:00:00.000Z`),
        status: "PENDING",
        holdExpiresAt: expiresAt,
        bookingPaymentId: payment.id,
        slots: {
          create: hours.map((hour) => ({
            courtId: court!.id,
            date: DATE,
            hour,
            holdExpiresAt: expiresAt,
          })),
        },
      },
      select: { id: true },
    });
    return { payment, booking };
  }
  const row = (id: string) =>
    prisma.bookingPayment.findUnique({ where: { id } });
  const payoutLines = (bookingPaymentId: string) =>
    prisma.payoutEntry.findMany({
      where: { bookingPaymentId },
      orderBy: { createdAt: "asc" },
    });
  const deliver = async (body: string, secret = CHECK_PLATFORM_WEBHOOK_SECRET) =>
    readPlatformPaymongoWebhook(
      body,
      new Headers({
        "paymongo-signature": signPaymongoBody(
          secret,
          body,
          Math.floor(Date.now() / 1000)
        ),
      })
    );

  // --- 1. The platform account is the one that is charged -------------------
  const status = await getPlatformCollectionStatus();
  ok(
    "the platform account is ready and reports its key mode",
    status.ready && status.environment === "TEST"
  );

  const one = await scaffold([6, 7]);
  const started = await chargeBookingPayment({
    paymentId: one.payment.id,
    userId: player.id,
  });
  ok("a QR Ph code is issued", started.status === "action");
  const intentRequest = mock.requests.find((r) =>
    r.url.endsWith("/payment_intents")
  );
  ok(
    "the charge is made with Bunal.club's key",
    requestsFor(mock, CHECK_PLATFORM_SECRET_KEY).length > 0 &&
      requestsFor(mock, CHECK_PLATFORM_SECRET_KEY).includes(intentRequest!)
  );
  ok(
    "and the venue's own PayMongo account is never contacted",
    requestsFor(mock, LEGACY_SECRET).length === 0
  );
  ok(
    "the player is charged the court total plus the flat ₱25 fee",
    (
      intentRequest!.body as { data: { attributes: { amount: number } } }
    ).data.attributes.amount === 52_500
  );
  const charged = await row(one.payment.id);
  ok(
    "Bunal's absorbed processing cost is estimated, not added to the charge",
    Number(charged!.processingFee) > 0 && Number(charged!.amount) === 525
  );

  // --- 2. The platform webhook settles it ----------------------------------
  const intentId = charged!.providerPaymentId!;
  const payId = payMockIntent(mock, intentId);
  const paidBody = mockPaymentPaidEvent(intentId, payId, 52_500, 788);

  const forged = await deliver(paidBody, "whsk_someone_elses_secret");
  ok("a delivery signed with another secret is rejected", forged.kind === "invalid");

  const delivery = await deliver(paidBody);
  ok(
    "a signed payment-intent event is recognised as a player payment",
    delivery.kind === "payment"
  );
  if (delivery.kind !== "payment") throw new Error("expected a payment event");
  const settled = await handlePlatformPaymentEvent(delivery.event);
  ok("and settles the booking", settled.applied);
  ok(
    "the booking is confirmed",
    (await prisma.booking.findUnique({ where: { id: one.booking.id } }))!
      .status === "CONFIRMED"
  );
  const paid = await row(one.payment.id);
  ok(
    "the payment succeeded and keeps PayMongo's exact fee",
    paid!.status === "SUCCEEDED" && Number(paid!.processingFee) === 7.88
  );

  // The two rails owe money in opposite directions.
  const earned = await payoutLines(one.payment.id);
  ok(
    "Bunal.club now owes the venue its full court total",
    earned.length === 1 &&
      earned[0].type === "EARNING" &&
      Number(earned[0].amount) === 500 &&
      earned[0].recipientId === partner.id &&
      earned[0].payoutId === null
  );
  ok(
    "and the venue owes no service fee, because Bunal.club already holds it",
    (await prisma.serviceFeeEntry.count({
      where: { bookingPaymentId: one.payment.id },
    })) === 0
  );

  const replay = await handlePlatformPaymentEvent(delivery.event);
  ok(
    "a replayed delivery is absorbed",
    !replay.applied &&
      replay.reason === "duplicate" &&
      (await payoutLines(one.payment.id)).length === 1
  );

  // --- 3. What the one webhook route will not do ----------------------------
  const unknown = await deliver(
    mockPaymentPaidEvent("pi_not_one_of_ours", "pay_x", 10_000)
  );
  ok(
    "an event for an intent this app never created is acknowledged, not applied",
    unknown.kind === "payment" &&
      (await handlePlatformPaymentEvent(unknown.event)).reason ===
        "unknown payment"
  );

  // A payment a venue's own account took has a provider id too. An event
  // signed by the platform account must never be able to settle it.
  const direct = await scaffold([9]);
  await prisma.bookingPayment.update({
    where: { id: direct.payment.id },
    data: {
      collectedBy: "DIRECT",
      gatewayId: legacyGateway.id,
      providerPaymentId: "pi_taken_by_the_venue",
      chargeStartedAt: new Date(),
    },
  });
  const crossRail = await deliver(
    mockPaymentPaidEvent("pi_taken_by_the_venue", "pay_cross", 27_500)
  );
  ok(
    "a platform-signed event cannot settle a payment a venue's account took",
    crossRail.kind === "payment" &&
      (await handlePlatformPaymentEvent(crossRail.event)).reason ===
        "unknown payment" &&
      (await row(direct.payment.id))!.status === "PENDING"
  );

  const unrelated = await deliver(
    JSON.stringify({
      data: {
        id: "evt_payout_deposited",
        attributes: {
          type: "payout.deposited",
          data: { id: "po_1", attributes: {} },
        },
      },
    })
  );
  ok(
    "a signed event the app does not act on is ignored rather than refused",
    unrelated.kind === "ignored"
  );
  const settlementEvent = await deliver(mockPaidEvent("cs_some_settlement", "pay_s", 2_500));
  ok(
    "a checkout-session event is routed to service-fee settlements instead",
    settlementEvent.kind === "settlement"
  );

  const mismatch = await scaffold([11]);
  await chargeBookingPayment({ paymentId: mismatch.payment.id, userId: player.id });
  const mismatchIntent = (await row(mismatch.payment.id))!.providerPaymentId!;
  const underpaid = await deliver(
    mockPaymentPaidEvent(mismatchIntent, payMockIntent(mock, mismatchIntent), 100)
  );
  ok(
    "an event reporting the wrong amount does not confirm the booking",
    underpaid.kind === "payment" &&
      (await handlePlatformPaymentEvent(underpaid.event)).reason ===
        "amount mismatch" &&
      (await row(mismatch.payment.id))!.status === "PENDING"
  );

  // --- 4. The page's poll settles it when the webhook is lost ---------------
  const polled = await scaffold([13]);
  await chargeBookingPayment({ paymentId: polled.payment.id, userId: player.id });
  payMockIntent(mock, (await row(polled.payment.id))!.providerPaymentId!);
  const pollOutcome = await pollBookingPayment(polled.payment.id);
  ok(
    "polling the platform account confirms a paid intent",
    pollOutcome.status === "confirmed" &&
      (await payoutLines(polled.payment.id)).length === 1
  );

  // --- 5. A player cancels before paying ------------------------------------
  const abandoned = await scaffold([15]);
  await chargeBookingPayment({ paymentId: abandoned.payment.id, userId: player.id });
  const cancelled = await cancelAutomaticBookingHold({
    paymentId: abandoned.payment.id,
    userId: player.id,
  });
  ok(
    "the QR intent is cancelled at the platform account and the hours released",
    cancelled.status === "cancelled" &&
      (await prisma.bookingSlot.count({
        where: { courtId: court.id, date: DATE, hour: 15 },
      })) === 0 &&
      (await payoutLines(abandoned.payment.id)).length === 0
  );

  // --- 6. A payment that lost its hold --------------------------------------
  // The player paid, but the hours were gone. They are refunded, and the
  // venue — which delivered nothing — is owed nothing.
  const lost = await scaffold([17]);
  await chargeBookingPayment({ paymentId: lost.payment.id, userId: player.id });
  const lostIntent = (await row(lost.payment.id))!.providerPaymentId!;
  const lostPay = payMockIntent(mock, lostIntent);
  await prisma.bookingSlot.deleteMany({ where: { bookingId: lost.booking.id } });
  const lostDelivery = await deliver(
    mockPaymentPaidEvent(lostIntent, lostPay, 27_500)
  );
  if (lostDelivery.kind !== "payment") throw new Error("expected a payment event");
  await handlePlatformPaymentEvent(lostDelivery.event);
  ok(
    "a payment that lost its hold is refunded from the platform account",
    (await row(lost.payment.id))!.status === "REFUNDED" &&
      mock.refunds.includes(lostPay)
  );
  ok(
    "and never becomes money owed to the venue",
    (await payoutLines(lost.payment.id)).length === 0
  );

  // --- 7. Refunding a confirmed booking -------------------------------------
  const refundsBefore = mock.requests.filter((r) => r.url.endsWith("/refunds"))
    .length;
  const [refundA, refundB] = await Promise.all([
    refundBookingPayment({
      paymentId: one.payment.id,
      reason: "Cancelled by the venue.",
      refundedById: partner.id,
    }),
    refundBookingPayment({
      paymentId: one.payment.id,
      reason: "Cancelled by the venue.",
      refundedById: partner.id,
    }),
  ]);
  const refundRequests = mock.requests
    .filter((r) => r.method === "POST" && r.url.endsWith("/refunds"))
    .slice(refundsBefore);
  ok(
    "two refund requests landing together reach PayMongo once",
    refundRequests.length === 1 &&
      [refundA, refundB].filter((outcome) => outcome.ok).length >= 1
  );
  ok(
    "the refund is issued from Bunal.club's account with an idempotency key",
    requestsFor(mock, CHECK_PLATFORM_SECRET_KEY).includes(refundRequests[0]) &&
      refundRequests[0].idempotencyKey.startsWith(`refund:${one.payment.id}:`)
  );
  ok(
    "only the venue amount goes back; the ₱25 fee is kept",
    (
      refundRequests[0].body as { data: { attributes: { amount: number } } }
    ).data.attributes.amount === 50_000 &&
      Number((await row(one.payment.id))!.refundedAmount) === 500
  );
  const afterRefund = await payoutLines(one.payment.id);
  ok(
    "the venue's share comes back off what Bunal.club owes it",
    afterRefund.length === 2 &&
      afterRefund[1].type === "REFUND" &&
      Number(afterRefund[1].amount) === -500
  );
  ok(
    "refunding again is a no-op",
    (
      await refundBookingPayment({
        paymentId: one.payment.id,
        reason: "again",
      })
    ).ok &&
      mock.requests.filter((r) => r.url.endsWith("/refunds")).length ===
        refundsBefore + 1
  );

  // --- 8. A refund issued from PayMongo's dashboard -------------------------
  const dashboardIntent = (await row(polled.payment.id))!.providerPaymentId!;
  const dashboardRefund = await deliver(
    mockPaymentRefundedEvent(dashboardIntent, "pay_dashboard", 27_500)
  );
  if (dashboardRefund.kind !== "payment") throw new Error("expected a payment event");
  ok(
    "a dashboard refund is mirrored onto the payment",
    (await handlePlatformPaymentEvent(dashboardRefund.event)).applied &&
      (await row(polled.payment.id))!.status === "REFUNDED"
  );
  const mirrored = await payoutLines(polled.payment.id);
  ok(
    "and deducts no more than the venue's share, even though the event reports the whole payment",
    mirrored.length === 2 && Number(mirrored[1].amount) === -250
  );

  await cleanup();
  ok(
    "the real payments are untouched",
    (await prisma.bookingPayment.count()) === baselinePayments
  );
}

// Idempotent, and safe to run after a failure part-way through.
async function cleanup() {
  await prisma.booking.deleteMany({ where: { date: DATE } });
  const partner = await prisma.user.findUnique({
    where: { email: PARTNER_EMAIL },
    select: { id: true },
  });
  if (partner) {
    await prisma.payoutEntry.deleteMany({ where: { recipientId: partner.id } });
    await prisma.bookingPayment.deleteMany({ where: { partnerId: partner.id } });
    // Cascades to the legacy gateway.
    await prisma.user.delete({ where: { id: partner.id } });
  }
  // Only this check's own deliveries: their ids are built from its fixtures.
  await prisma.providerEvent.deleteMany({
    where: {
      provider: "platform:paymongo",
      OR: [
        { eventId: { startsWith: "evt_pi_" } },
        { eventId: { startsWith: "evt_refunded_pi_" } },
        { eventId: { in: ["evt_payout_deposited", "evt_cs_some_settlement"] } },
      ],
    },
  });
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
