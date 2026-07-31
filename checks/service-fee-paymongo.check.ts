// Partner-to-admin service-fee settlement through PayMongo.
//
//   npm run check:settlement-paymongo
//
// PayMongo is mocked at the network boundary. Everything else — settlement
// creation, signed events, replay protection, and ledger balance — runs through
// production code against Postgres.
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run } from "./harness";
import {
  installPaymongoMock,
  mockPaidEvent,
  payMockSession,
} from "./paymongo-mock";
import { signPaymongoBody } from "@/lib/payments/paymongo-core";

const prisma = new PrismaClient();
const EMAIL = "check-service-fee-paymongo@example.test";
const WEBHOOK = "whsk_service_fee_check";
const eventIds: string[] = [];

async function cleanup() {
  if (eventIds.length) {
    await prisma.providerEvent.deleteMany({
      where: {
        provider: "platform:paymongo",
        eventId: { in: eventIds },
      },
    });
  }
  await prisma.user.deleteMany({ where: { email: EMAIL } });
}

async function check() {
  await cleanup();
  process.env.PLATFORM_GATEWAY_ENV_OVERRIDE = "1";
  process.env.PAYMONGO_SECRET_KEY = "sk_test_service_fee_check";
  process.env.BILLING_WEBHOOK_SECRET = WEBHOOK;

  const mock = installPaymongoMock();
  const [player, hub] = await Promise.all([
    prisma.user.findFirst({
      where: { role: "PLAYER" },
      select: { id: true },
    }),
    prisma.hub.findFirst({ select: { id: true } }),
  ]);
  if (!player || !hub) throw new Error("Seed a player and hub first.");

  const partner = await prisma.user.create({
    data: {
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      name: "QR Settlement Check",
      email: EMAIL,
      passwordHash: "x",
    },
    select: { id: true, name: true },
  });
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_service_fee",
      secretKeyEnc: "x",
      webhookSecretEnc: "x",
      secretKeyHint: "…test",
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
    select: { id: true },
  });

  async function accrue(fee: number) {
    const payment = await prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        gatewayId: gateway.id,
        userId: player!.id,
        hubId: hub!.id,
        amount: 500 + fee,
        venueAmount: 500,
        platformFee: fee,
        method: "GCASH",
        status: "SUCCEEDED",
        expiresAt: new Date(),
        provider: "paymongo",
        paidAt: new Date(),
      },
      select: { id: true },
    });
    await prisma.serviceFeeEntry.create({
      data: {
        partnerId: partner.id,
        bookingPaymentId: payment.id,
        type: "CHARGE",
        amount: fee,
      },
    });
  }

  const {
    handleServiceFeeProviderEvent,
    pollLatestServiceFeeCheckout,
    pollServiceFeeCheckout,
    startServiceFeeCheckout,
  } = await import("@/lib/service-fee-payments");
  const { verifyPlatformPaymongoWebhook } =
    await import("@/lib/payments/paymongo-platform");
  const { calculateServiceFeeBalance } = await import("@/lib/service-fees");

  await accrue(25);
  const first = await startServiceFeeCheckout({
    partnerId: partner.id,
    partnerName: partner.name!,
  });
  ok("an outstanding balance opens PayMongo", first.status === "redirect");
  const firstUrl = first.status === "redirect" ? first.url : null;

  const created = mock.requests.find((request) =>
    request.url.endsWith("/v2/checkout_sessions")
  );
  const attributes = (
    created!.body as { data: { attributes: Record<string, unknown> } }
  ).data.attributes;
  ok(
    "the checkout offers QR Ph, card, GCash and Maya",
    JSON.stringify(attributes.payment_method_types) ===
      JSON.stringify(["qrph", "card", "gcash", "paymaya"])
  );
  ok(
    "the exact ₱25 balance is sent in centavos",
    (attributes.line_items as { amount: number }[])[0].amount === 2500
  );
  ok("PayMongo processing fees pass through", attributes.pass_on_fees === true);

  const awaiting = await prisma.serviceFeeSettlement.findFirst({
    where: { partnerId: partner.id, status: "AWAITING_PAYMENT" },
    orderBy: { createdAt: "desc" },
  });
  ok("the local settlement waits for payment", awaiting != null);
  ok(
    "the local id is the PayMongo idempotency key",
    created!.idempotencyKey === `service-fee:${awaiting!.id}`
  );

  const repeated = await startServiceFeeCheckout({
    partnerId: partner.id,
    partnerName: partner.name!,
  });
  ok(
    "pressing pay twice reuses the checkout",
    repeated.status === "redirect" && repeated.url === firstUrl
  );
  ok(
    "and creates no second PayMongo session",
    mock.requests.filter((request) =>
      request.url.endsWith("/v2/checkout_sessions")
    ).length === 1
  );

  payMockSession(mock, awaiting!.providerPaymentId!);
  ok(
    "the browser return leg confirms payment",
    (
      await pollLatestServiceFeeCheckout(partner.id)
    ).status === "paid"
  );
  ok(
    "the paid settlement clears the balance",
    (await calculateServiceFeeBalance(prisma, partner.id)).amountDue === 0
  );

  await accrue(15);
  await startServiceFeeCheckout({
    partnerId: partner.id,
    partnerName: partner.name!,
  });
  const second = await prisma.serviceFeeSettlement.findFirst({
    where: { partnerId: partner.id, status: "AWAITING_PAYMENT" },
    orderBy: { createdAt: "desc" },
  });
  const paymentId = payMockSession(mock, second!.providerPaymentId!);
  const body = mockPaidEvent(second!.providerPaymentId!, paymentId, 1500);
  const headers = new Headers({
    "paymongo-signature": signPaymongoBody(
      WEBHOOK,
      body,
      Math.floor(Date.now() / 1000)
    ),
  });
  ok(
    "an invalid signature is refused",
    (await verifyPlatformPaymongoWebhook(body, new Headers())) === null
  );
  const event = (await verifyPlatformPaymongoWebhook(body, headers))!;
  eventIds.push(event.eventId);
  ok(
    "the signed webhook settles the PayMongo payment",
    (await handleServiceFeeProviderEvent(event)).applied
  );
  const replay = await handleServiceFeeProviderEvent(event);
  ok(
    "a replay is harmless",
    !replay.applied && replay.reason === "duplicate"
  );
  ok(
    "the webhook stores the PayMongo payment reference",
    (
      await prisma.serviceFeeSettlement.findUnique({
        where: { id: second!.id },
        select: { status: true, paymentReference: true },
      })
    )?.paymentReference === paymentId
  );

  await accrue(15);
  await startServiceFeeCheckout({
    partnerId: partner.id,
    partnerName: partner.name!,
  });
  const third = await prisma.serviceFeeSettlement.findFirst({
    where: { partnerId: partner.id, status: "AWAITING_PAYMENT" },
    orderBy: { createdAt: "desc" },
  });
  const thirdPaymentId = payMockSession(mock, third!.providerPaymentId!);
  const wrongAmountBody = mockPaidEvent(
    third!.providerPaymentId!,
    thirdPaymentId,
    1400
  );
  const wrongAmountEvent = (await verifyPlatformPaymongoWebhook(
    wrongAmountBody,
    new Headers({
      "paymongo-signature": signPaymongoBody(
        WEBHOOK,
        wrongAmountBody,
        Math.floor(Date.now() / 1000)
      ),
    })
  ))!;
  eventIds.push(wrongAmountEvent.eventId);
  const mismatch = await handleServiceFeeProviderEvent(wrongAmountEvent);
  ok(
    "a signed event with the wrong amount cannot settle",
    !mismatch.applied && mismatch.reason === "underpaid"
  );
  ok(
    "the authoritative return check can still settle the right amount",
    (
      await pollServiceFeeCheckout({
        settlementId: third!.id,
        partnerId: partner.id,
      })
    ).status === "paid"
  );
}

void run(check, async () => {
  await cleanup();
  delete process.env.PLATFORM_GATEWAY_ENV_OVERRIDE;
  await prisma.$disconnect();
});
