// The venue money path — a player paying a venue — end to end against
// Postgres, with PayMongo mocked at the network boundary.
//
//   npm run check:money
//
// What it is really guarding: the hold, the double-charge claim, the webhook
// that settles it, and the isolation between two partners' money. Those are
// the places where a bug costs somebody real pesos, and none of them are
// visible to a type check.
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import { installPaymongoMock, mockPaidEvent, payMockSession } from "./paymongo-mock";
import { bookingServiceFeeFor, grossFor } from "@/lib/constants";

const prisma = new PrismaClient();

// Far future: a fixture can never collide with a real booking.
const DATE = "2099-12-30";
const SECRET = `sk_test_${crypto.randomBytes(10).toString("hex")}`;
const WEBHOOK = `whsk_${crypto.randomBytes(12).toString("hex")}`;
const TEMP_EMAILS = [
  "check-partner-a@example.test",
  "check-partner-b@example.test",
  "check-partner-legacy@example.test",
];

async function check() {
  const mock = installPaymongoMock();

  // Imported after the mock is installed, so nothing captures the real fetch.
  const { CRYPTO_PURPOSE, encrypt, secretHint } = await import("@/lib/crypto");
  const { chargeBookingPayment, pollBookingPayment, refundBookingPayment } =
    await import("@/lib/booking-payments");
  const { handleVenueEvent } = await import("@/lib/booking-webhook");
  const { getVenueGateway } = await import("@/lib/payments/venue");
  const { signPaymongoBody } = await import("@/lib/payments/paymongo-core");

  const court = await prisma.court.findFirst({
    select: { id: true, hubId: true },
  });
  const player = await prisma.user.findFirst({
    where: { role: "PLAYER" },
    select: { id: true },
  });
  if (!court || !player) throw new Error("Seed a hub with a court and a player first.");

  const baselinePayments = await prisma.bookingPayment.count();
  const baselineGateways = await prisma.partnerGateway.count();

  // Two throwaway partners, each with their own PayMongo account, so the
  // isolation assertions have something real to isolate.
  const makePartner = async (email: string, secret: string, webhook: string) => {
    const user = await prisma.user.create({
      data: { role: "PARTNER", name: email, email, passwordHash: "x" },
      select: { id: true },
    });
    const gateway = await prisma.partnerGateway.create({
      data: {
        userId: user.id,
        provider: "paymongo",
        publicKey: "pk_test_abcdefgh",
        secretKeyEnc: encrypt(secret, CRYPTO_PURPOSE.gatewaySecretKey),
        webhookSecretEnc: encrypt(webhook, CRYPTO_PURPOSE.gatewayWebhookSecret),
        secretKeyHint: secretHint(secret),
        webhookToken: crypto.randomBytes(24).toString("base64url"),
      },
      select: { id: true },
    });
    return { userId: user.id, gatewayId: gateway.id };
  };

  const a = await makePartner(TEMP_EMAILS[0], SECRET, WEBHOOK);
  const b = await makePartner(TEMP_EMAILS[1], "sk_test_bbbbbbbbbb", "whsk_bbbbbbbbbbbb");

  // A booking holding its hours, with a payment waiting on it.
  async function scaffold(hours: number[], owner = a) {
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const venueAmount = 250 * hours.length;
    const payment = await prisma.bookingPayment.create({
      data: {
        partnerId: owner.userId,
        gatewayId: owner.gatewayId,
        userId: player!.id,
        hubId: court!.hubId,
        amount: grossFor(venueAmount),
        venueAmount,
        platformFee: bookingServiceFeeFor(venueAmount),
        method: "CARD",
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

  // --- 1. Starting a payment ------------------------------------------------
  const one = await scaffold([6, 7]);
  const started = await chargeBookingPayment({
    paymentId: one.payment.id,
    userId: player.id,
  });
  ok("a charge hands back a redirect", started.status === "redirect");
  ok(
    "to PayMongo's hosted checkout",
    started.status === "redirect" && started.url.includes("checkout.paymongo.com")
  );

  const created = mock.requests.find((r) => r.url.endsWith("/checkout_sessions"));
  ok("PayMongo was actually called", created != null);
  ok("checkout uses PayMongo V2", created!.url.includes("/v2/checkout_sessions"));
  ok(
    "with the partner's own secret key",
    Buffer.from(created!.auth.replace("Basic ", ""), "base64")
      .toString()
      .startsWith(SECRET)
  );
  const attrs = (created!.body as { data: { attributes: Record<string, unknown> } })
    .data.attributes;
  ok("in centavos", (attrs.line_items as { amount: number }[])[0].amount === 51500);
  ok(
    "offering card, GCash, Maya and QR Ph",
    JSON.stringify(attrs.payment_method_types) ===
      JSON.stringify(["card", "gcash", "paymaya", "qrph"])
  );
  ok("tagged with our payment id", attrs.reference_number === one.payment.id);
  ok("PayMongo processing fees pass through", attrs.pass_on_fees === true);

  const row = await prisma.bookingPayment.findUnique({
    where: { id: one.payment.id },
  });
  ok("the session id is stored", row!.providerPaymentId?.startsWith("cs_") === true);
  ok("the row stays PENDING until they pay", row!.status === "PENDING");
  ok("the claim is held while they're away", row!.chargeStartedAt !== null);
  ok(
    "the booking is not confirmed yet",
    (await prisma.booking.findUnique({ where: { id: one.booking.id } }))!.status ===
      "PENDING"
  );

  const again = await chargeBookingPayment({
    paymentId: one.payment.id,
    userId: player.id,
  });
  ok("pressing pay twice is refused", again.status === "in-flight");
  ok(
    "and opens no second checkout session",
    mock.requests.filter((r) => r.url.endsWith("/checkout_sessions")).length === 1
  );

  // --- 2. The webhook settles it -------------------------------------------
  const sessionId = row!.providerPaymentId!;
  const payId = payMockSession(mock, sessionId);
  const body = mockPaidEvent(sessionId, payId);
  const creds = {
    provider: "paymongo" as const,
    publicKey: "pk_test_abcdefgh",
    secretKey: SECRET,
    webhookSecret: WEBHOOK,
  };
  const sign = (secret: string) =>
    new Headers({
      "paymongo-signature": signPaymongoBody(
        secret,
        body,
        Math.floor(Date.now() / 1000)
      ),
    });

  const event = await getVenueGateway(creds).verifyWebhook(body, sign(WEBHOOK));
  ok("the webhook verifies", event !== null);
  ok("and settles", (await handleVenueEvent({ gatewayId: a.gatewayId, event: event! })).applied);
  ok(
    "the booking is confirmed",
    (await prisma.booking.findUnique({ where: { id: one.booking.id } }))!.status ===
      "CONFIRMED"
  );

  const paid = await prisma.bookingPayment.findUnique({
    where: { id: one.payment.id },
  });
  ok("the payment succeeded", paid!.status === "SUCCEEDED");
  ok("the pay_ id is kept, which is what a refund needs", paid!.providerRef === payId);
  ok("the method the payer actually chose is recorded", paid!.method === "GCASH");
  ok(
    "the successful booking accrues one service fee",
    (await prisma.serviceFeeEntry.count({
      where: { bookingPaymentId: one.payment.id, type: "CHARGE" },
    })) === 1
  );
  ok(
    "the hold is released on every slot",
    (await prisma.bookingSlot.findMany({ where: { bookingId: one.booking.id } })).every(
      (s) => s.holdExpiresAt === null
    )
  );

  const replay = await handleVenueEvent({ gatewayId: a.gatewayId, event: event! });
  ok("a replayed delivery changes nothing", !replay.applied && replay.reason === "duplicate");
  ok(
    "a replay cannot duplicate the service fee",
    (await prisma.serviceFeeEntry.count({
      where: { bookingPaymentId: one.payment.id, type: "CHARGE" },
    })) === 1
  );

  ok(
    "another partner's secret cannot verify it",
    (await getVenueGateway({
      ...creds,
      secretKey: "sk_test_bbbbbbbbbb",
      webhookSecret: "whsk_bbbbbbbbbbbb",
    }).verifyWebhook(body, sign(WEBHOOK))) === null
  );

  const wrongGateway = await handleVenueEvent({
    gatewayId: b.gatewayId,
    event: { ...event!, eventId: "evt_wrong_gateway" },
  });
  ok(
    "and their gateway cannot settle our payment",
    !wrongGateway.applied && wrongGateway.reason === "unknown payment"
  );

  // --- 3. The return leg ----------------------------------------------------
  // The browser can beat the webhook back; the page asks the gateway directly.
  const two = await scaffold([9]);
  await chargeBookingPayment({ paymentId: two.payment.id, userId: player.id });
  const twoRow = await prisma.bookingPayment.findUnique({
    where: { id: two.payment.id },
  });
  payMockSession(mock, twoRow!.providerPaymentId!);
  ok(
    "the return-leg poll settles without a webhook",
    (await pollBookingPayment(two.payment.id)).status === "confirmed"
  );

  // --- 4. A gateway error must not cost the player their court -------------
  const three = await scaffold([11]);
  mock.failNext = { status: 400, code: "resource_failed", detail: "Try again." };
  const failed = await chargeBookingPayment({
    paymentId: three.payment.id,
    userId: player.id,
  });
  ok("a gateway error is reported", failed.status === "declined");
  ok(
    "with PayMongo's own wording",
    failed.status === "declined" && failed.message === "Try again."
  );

  const threeRow = await prisma.bookingPayment.findUnique({
    where: { id: three.payment.id },
  });
  ok("the payment stays PENDING", threeRow!.status === "PENDING");
  ok("the claim is released so they can retry", threeRow!.chargeStartedAt === null);
  ok(
    "and the hours are still held",
    (await prisma.booking.findUnique({ where: { id: three.booking.id } }))!.status ===
      "PENDING"
  );

  const retried = await chargeBookingPayment({
    paymentId: three.payment.id,
    userId: player.id,
  });
  ok("the retry gets a checkout", retried.status === "redirect");
  ok(
    "on the same payment row",
    (await prisma.bookingPayment.count({
      where: { bookings: { some: { id: three.booking.id } } },
    })) === 1
  );

  // --- 5. Refunds -----------------------------------------------------------
  const refund = await refundBookingPayment({
    paymentId: one.payment.id,
    reason: "Cancelled by the venue.",
    refundedById: a.userId,
  });
  ok("a refund succeeds", refund.ok);
  ok("PayMongo was asked to refund the pay_ id", mock.refunds.includes(payId));

  const refunded = await prisma.bookingPayment.findUnique({
    where: { id: one.payment.id },
  });
  ok("recorded as REFUNDED", refunded!.status === "REFUNDED");
  ok("for the full booking subtotal", Number(refunded!.refundedAmount) === 515);
  ok(
    "the refund reverses the service fee",
    (await prisma.serviceFeeEntry.count({
      where: { bookingPaymentId: one.payment.id, type: "REFUND" },
    })) === 1
  );
  ok(
    "and refunding twice does not refund twice",
    (await refundBookingPayment({ paymentId: one.payment.id })).ok === true &&
      mock.refunds.filter((r) => r === payId).length === 1
  );

  // --- 6. Money taken through a gateway that no longer exists --------------
  // Its own owner: PartnerGateway.userId is unique, one account one gateway.
  const legacyOwner = await prisma.user.create({
    data: {
      role: "PARTNER",
      name: "legacy",
      email: TEMP_EMAILS[2],
      passwordHash: "x",
    },
    select: { id: true },
  });
  const legacyGateway = await prisma.partnerGateway.create({
    data: {
      userId: legacyOwner.id,
      provider: "legacy-gateway",
      publicKey: "pk_test_old",
      secretKeyEnc: encrypt("sk_test_old", CRYPTO_PURPOSE.gatewaySecretKey),
      webhookSecretEnc: encrypt("whsec_old", CRYPTO_PURPOSE.gatewayWebhookSecret),
      secretKeyHint: secretHint("sk_test_old"),
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
    select: { id: true },
  });
  const legacy = await prisma.bookingPayment.create({
    data: {
      partnerId: legacyOwner.id,
      gatewayId: legacyGateway.id,
      userId: player.id,
      hubId: court.hubId,
      amount: 100,
      method: "CARD",
      status: "SUCCEEDED",
      expiresAt: new Date(),
      provider: "legacy-gateway",
      providerPaymentId: "old_pi_1",
      paidAt: new Date(),
    },
    select: { id: true },
  });

  const legacyRefund = await refundBookingPayment({ paymentId: legacy.id });
  ok("refunding a removed gateway fails cleanly rather than 500ing", !legacyRefund.ok);
  ok(
    "with a message that says what to do instead",
    !legacyRefund.ok && legacyRefund.message.includes("no longer supported")
  );

  // --- 7. Nothing real was touched -----------------------------------------
  await cleanup();
  ok(
    "the real payments are untouched",
    (await prisma.bookingPayment.count()) === baselinePayments
  );
  ok(
    "and the real gateways",
    (await prisma.partnerGateway.count()) === baselineGateways
  );
}

// Idempotent, and safe to run after a failure part-way through.
async function cleanup() {
  await prisma.booking.deleteMany({ where: { date: DATE } });
  const temps = await prisma.user.findMany({
    where: { email: { in: TEMP_EMAILS } },
    select: { id: true },
  });
  const ids = temps.map((t) => t.id);
  if (ids.length) {
    await prisma.bookingPayment.deleteMany({ where: { partnerId: { in: ids } } });
    // Cascades to their gateways.
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.providerEvent.deleteMany({
    where: { provider: { startsWith: "venue:" } },
  });
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
