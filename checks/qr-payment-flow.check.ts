// Paid event registration: one action reserves the spot and prepares one
// QR Ph-only PayMongo checkout before redirecting to the internal QR screen.
//
//   npm run check:qr-flow
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { installPaymongoMock } from "./paymongo-mock";
import { BOOKING_HOLD_MINUTES } from "@/lib/constants";
import { manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-qr-flow-partner@example.test";
const PLAYER_EMAIL = "check-qr-flow-player@example.test";
const DATE = "2099-12-20";

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, PLAYER_EMAIL] } },
  });
}

async function check() {
  const paymongo = installPaymongoMock();
  const { CRYPTO_PURPOSE, encrypt, secretHint } = await import("@/lib/crypto");

  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "QR flow partner",
      email: PARTNER_EMAIL,
      passwordHash: "x",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true },
  });
  const player = await prisma.user.create({
    data: {
      name: "QR flow player",
      email: PLAYER_EMAIL,
      passwordHash: "x",
      role: "PLAYER",
    },
    select: { id: true, email: true, role: true },
  });
  await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_qr_flow",
      secretKeyEnc: encrypt(
        "sk_test_qr_flow",
        CRYPTO_PURPOSE.gatewaySecretKey
      ),
      webhookSecretEnc: encrypt(
        "whsk_qr_flow",
        CRYPTO_PURPOSE.gatewayWebhookSecret
      ),
      secretKeyHint: secretHint("sk_test_qr_flow"),
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "QR Flow Hub",
      slug: `qr-flow-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
    },
    select: { id: true },
  });
  const event = await prisma.event.create({
    data: {
      publicId: `qr-flow-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "QR Flow Event",
      sport: "pickleball",
      date: DATE,
      startHour: 18,
      endHour: 20,
      startsAt: manilaInstant(DATE, 18),
      endsAt: manilaInstant(DATE, 20),
      capacity: 8,
      registrationFee: 500,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });

  stubRequestContext(player);
  const { registerForEventAction } = await import("@/lib/event-actions");
  const form = new FormData();
  form.set("publicId", event.publicId);

  const startedAfter = Date.now();
  let redirected = false;
  try {
    await registerForEventAction({}, form);
  } catch (error) {
    redirected = error instanceof Error && error.message.includes("redirect");
  }
  const createdBefore = Date.now();

  const registration = await prisma.eventRegistration.findUnique({
    where: { eventId_userId: { eventId: event.id, userId: player.id } },
    include: { payment: true },
  });
  const checkout = paymongo.requests.find((request) =>
    request.url.endsWith("/v2/checkout_sessions")
  );
  const methods = checkout
    ? (
        checkout.body as {
          data: { attributes: { payment_method_types: string[] } };
        }
      ).data.attributes.payment_method_types
    : [];

  ok("paid event registration redirects to its payment screen", redirected);
  ok(
    "paid event registration prepares one QR Ph checkout automatically",
    paymongo.requests.filter((request) =>
      request.url.endsWith("/v2/checkout_sessions")
    ).length === 1 && JSON.stringify(methods) === JSON.stringify(["qrph"])
  );
  ok(
    "the event spot and QR Ph payment share the configured 15-minute hold",
    registration?.status === "PENDING" &&
      registration.payment?.method === "QRPH" &&
      registration.payment.redirectUrl?.includes("checkout.paymongo.com") ===
        true &&
      registration.holdExpiresAt != null &&
      registration.holdExpiresAt.getTime() >=
        startedAfter + BOOKING_HOLD_MINUTES * 60_000 &&
      registration.holdExpiresAt.getTime() <=
        createdBefore + BOOKING_HOLD_MINUTES * 60_000
  );

  const { GET: getPaymentStatus } = await import(
    "@/app/api/payments/[paymentId]/status/route"
  );
  const ownedStatus = await getPaymentStatus(
    new Request("https://www.bunal.club/api/payments/status"),
    {
      params: Promise.resolve({
        paymentId: registration!.bookingPaymentId!,
      }),
    }
  );
  const missingStatus = await getPaymentStatus(
    new Request("https://www.bunal.club/api/payments/status"),
    { params: Promise.resolve({ paymentId: "not-the-players-payment" }) }
  );
  const ownedBody = (await ownedStatus.json()) as {
    status?: string;
    secondsLeft?: number;
    chargeInFlight?: boolean;
  };
  ok(
    "the owning player can poll minimal checkout status",
    ownedStatus.status === 200 &&
      ownedBody.status === "PENDING" &&
      ownedBody.chargeInFlight === true &&
      Number(ownedBody.secondsLeft) > 0
  );
  ok(
    "the status route does not expose another payment id",
    missingStatus.status === 404
  );
}

run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
