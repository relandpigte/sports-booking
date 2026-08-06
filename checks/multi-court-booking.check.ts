// Multi-court carts: same-hour selection, one payment, and atomic collisions.
//
//   npm run check:multi-court
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { installPaymongoMock } from "./paymongo-mock";
import {
  BOOKING_HOLD_MINUTES,
  WEEKDAYS,
  type OperatingHours,
} from "@/lib/constants";
import { addDays, manilaToday } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-multi-court-partner@example.test";
const PLAYER_EMAIL = "check-multi-court-player@example.test";

const operatingHours = Object.fromEntries(
  WEEKDAYS.map(({ value }) => [
    value,
    { closed: false, open: "06:00", close: "22:00" },
  ])
) as OperatingHours;

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, PLAYER_EMAIL] } },
  });
}

async function check() {
  const paymongo = installPaymongoMock();
  const { CRYPTO_PURPOSE, encrypt } = await import("@/lib/crypto");
  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "Multi-court check partner",
      email: PARTNER_EMAIL,
      passwordHash: "x",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true },
  });
  const player = await prisma.user.create({
    data: {
      name: "Multi-court check player",
      email: PLAYER_EMAIL,
      passwordHash: "x",
      role: "PLAYER",
    },
    select: { id: true, email: true, role: true },
  });
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_multi_court",
      secretKeyEnc: encrypt(
        "sk_test_multi_court",
        CRYPTO_PURPOSE.gatewaySecretKey
      ),
      webhookSecretEnc: encrypt(
        "whsk_multi_court",
        CRYPTO_PURPOSE.gatewayWebhookSecret
      ),
      secretKeyHint: "…test",
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Multi-court Check Hub",
      slug: `multi-court-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
      operatingHours,
      courts: {
        create: [
          { name: "Court One", courtType: "covered", hourlyRate: 500 },
          { name: "Court Two", courtType: "open", hourlyRate: 400 },
        ],
      },
    },
    select: {
      id: true,
      courts: { orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });
  const [courtOne, courtTwo] = hub.courts;
  const date = addDays(manilaToday(), 7);

  stubRequestContext(player);
  const { createBookingAction } = await import("@/lib/booking-actions");
  const form = new FormData();
  form.set("date", date);
  for (const [courtId, hour] of [
    [courtOne.id, 9],
    [courtOne.id, 10],
    [courtTwo.id, 9],
  ] as const) {
    form.append("courtIds", courtId);
    form.append("hours", String(hour));
  }

  const holdStartedAfter = Date.now();
  let redirected = false;
  try {
    await createBookingAction({}, form);
  } catch (error) {
    redirected = error instanceof Error && error.message.includes("redirect");
  }
  const holdCreatedBefore = Date.now();
  ok("a paid multi-court cart proceeds to one checkout", redirected);
  const checkoutRequests = paymongo.requests.filter((request) =>
    request.url.endsWith("/v2/checkout_sessions")
  );
  ok(
    "the booking action automatically creates one QR Ph checkout",
    checkoutRequests.length === 1 &&
      JSON.stringify(
        (
          checkoutRequests[0].body as {
            data: { attributes: { payment_method_types: string[] } };
          }
        ).data.attributes.payment_method_types
      ) === JSON.stringify(["qrph"])
  );

  const payment = await prisma.bookingPayment.findFirst({
    where: { userId: player.id, hubId: hub.id, gatewayId: gateway.id },
    include: {
      bookings: { orderBy: [{ courtId: "asc" }, { startHour: "asc" }] },
    },
  });
  ok(
    "one payment covers every selected court",
    payment?.bookings.length === 2 && Number(payment.venueAmount) === 1_400
  );
  const configuredHoldMs = BOOKING_HOLD_MINUTES * 60_000;
  ok(
    "paid carts receive the configured 15-minute hold",
    BOOKING_HOLD_MINUTES === 15 &&
      payment != null &&
      payment.expiresAt.getTime() >= holdStartedAfter + configuredHoldMs &&
      payment.expiresAt.getTime() <= holdCreatedBefore + configuredHoldMs &&
      payment.bookings.every(
        (booking) =>
          booking.holdExpiresAt?.getTime() === payment.expiresAt.getTime()
      )
  );
  const sameHourSlots = await prisma.bookingSlot.findMany({
    where: { date, hour: 9, courtId: { in: [courtOne.id, courtTwo.id] } },
  });
  ok(
    "the same player may reserve the same hour on multiple courts",
    sameHourSlots.length === 2
  );

  const collision = new FormData();
  collision.set("date", date);
  for (const [courtId, hour] of [
    [courtOne.id, 9],
    [courtTwo.id, 11],
  ] as const) {
    collision.append("courtIds", courtId);
    collision.append("hours", String(hour));
  }
  const blocked = await createBookingAction({}, collision);
  ok(
    "an occupied court-hour rejects the cart",
    blocked.message?.includes("booked") === true ||
      blocked.errors?.hours?.includes("no longer available") === true
  );
  ok(
    "a rejected cart does not partially reserve another court",
    (await prisma.bookingSlot.count({
      where: { courtId: courtTwo.id, date, hour: 11 },
    })) === 0
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
