// Multi-court carts: same-hour selection, one payment, and atomic collisions.
//
//   npm run check:multi-court
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { installPaymongoMock, payMockIntent } from "./paymongo-mock";
import {
  BOOKING_HOLD_MINUTES,
  WEEKDAYS,
  type OperatingHours,
} from "@/lib/constants";
import { addDays, manilaInstant, manilaToday } from "@/lib/time";

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
  process.env.APP_URL = "https://checks.bunal.club";
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
  const otherHub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Other Multi-court Check Hub",
      slug: `other-multi-court-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
      operatingHours,
      courts: {
        create: { name: "Other Court", courtType: "covered", hourlyRate: 350 },
      },
    },
    select: {
      id: true,
      courts: { select: { id: true } },
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
  const created = await createBookingAction({}, form);
  const holdCreatedBefore = Date.now();
  ok(
    "a paid multi-court cart returns one live reservation hold",
    created.hold?.courtHours === 3 && created.hold.lines.length === 2
  );
  ok(
    "the booking action does not contact the payment provider before Pay now",
    paymongo.requests.filter((request) =>
      request.url.endsWith("/v1/payment_intents")
    ).length === 0
  );

  const { continueHeldBookingPaymentAction, releaseBookingHoldAction } =
    await import("@/lib/booking-payment-actions");
  const {
    chargeBookingPayment,
    getActiveBookingHoldForHub,
    getActiveBookingHoldForUser,
  } =
    await import("@/lib/booking-payments");
  const restoredHold = await getActiveBookingHoldForHub({
    userId: player.id,
    hubId: hub.id,
  });
  ok(
    "a refresh restores the active unpaid hold",
    restoredHold?.paymentId === created.hold!.paymentId &&
      restoredHold.selections.length === 3
  );
  const otherHubForm = new FormData();
  otherHubForm.set("date", date);
  otherHubForm.append("courtIds", otherHub.courts[0].id);
  otherHubForm.append("hours", "14");
  const otherHubResult = await createBookingAction({}, otherHubForm);
  ok(
    "an active unpaid hold blocks a second hold at another hub",
    otherHubResult.activeHoldConflict === true &&
      otherHubResult.message?.includes("Multi-court Check Hub") === true &&
      (await prisma.bookingSlot.count({
        where: { courtId: otherHub.courts[0].id, date, hour: 14 },
      })) === 0
  );
  const payForm = new FormData();
  payForm.set("paymentId", created.hold!.paymentId);
  let redirected = false;
  try {
    await continueHeldBookingPaymentAction({}, payForm);
  } catch (error) {
    redirected = error instanceof Error && error.message.includes("redirect");
  }
  ok("Pay now proceeds to the held booking checkout", redirected);
  const intentRequests = paymongo.requests.filter((request) =>
    request.url.endsWith("/v1/payment_intents")
  );
  ok(
    "Pay now creates one direct QR Ph intent",
    intentRequests.length === 1 &&
      JSON.stringify(
        (
          intentRequests[0].body as {
            data: { attributes: { payment_method_allowed: string[] } };
          }
        ).data.attributes.payment_method_allowed
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
  const startedHold = await getActiveBookingHoldForUser({ userId: player.id });
  ok(
    "a provider-backed checkout remains global and can be cancelled safely",
    startedHold?.releaseAllowed === false &&
      startedHold.cancellationAllowed === true
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

  const startedReleaseForm = new FormData();
  startedReleaseForm.set("paymentId", created.hold!.paymentId);
  const startedRelease = await releaseBookingHoldAction(
    {},
    startedReleaseForm
  );
  const cancelledPayment = await prisma.bookingPayment.findUnique({
    where: { id: created.hold!.paymentId },
    include: { bookings: true },
  });
  ok(
    "cancelling an active QR intent releases every reserved slot",
    startedRelease.released === true &&
      startedRelease.redirectTo === "/dashboard/bookings" &&
      (await prisma.bookingSlot.count({
        where: { date, hour: 9, courtId: { in: [courtOne.id, courtTwo.id] } },
      })) === 0 &&
      cancelledPayment?.status === "FAILED" &&
      cancelledPayment.failureCode === "player_cancelled" &&
      cancelledPayment.bookings.length === 0 &&
      paymongo.intents.get(cancelledPayment.providerPaymentId ?? "")?.status ===
        "cancelled"
  );

  const raceDate = addDays(manilaToday(), 8);
  const raceForm = new FormData();
  raceForm.set("date", raceDate);
  raceForm.append("courtIds", courtOne.id);
  raceForm.append("hours", "12");
  const raceResult = await createBookingAction({}, raceForm);
  const racePayForm = new FormData();
  racePayForm.set("paymentId", raceResult.hold!.paymentId);
  try {
    await continueHeldBookingPaymentAction({}, racePayForm);
  } catch {
    // The action redirects to the checkout after creating the QR intent.
  }
  const racePayment = await prisma.bookingPayment.findUnique({
    where: { id: raceResult.hold!.paymentId },
    select: { providerPaymentId: true },
  });
  if (!racePayment?.providerPaymentId) {
    throw new Error("Expected a provider intent for the cancellation race.");
  }
  payMockIntent(paymongo, racePayment.providerPaymentId);
  const raceCancelForm = new FormData();
  raceCancelForm.set("paymentId", raceResult.hold!.paymentId);
  const raceCancel = await releaseBookingHoldAction({}, raceCancelForm);
  const paidRace = await prisma.bookingPayment.findUnique({
    where: { id: raceResult.hold!.paymentId },
    include: { bookings: true },
  });
  ok(
    "a completed payment wins the cancellation race and keeps its slots",
    raceCancel.released !== true &&
      raceCancel.message?.includes("confirmed") === true &&
      paidRace?.status === "SUCCEEDED" &&
      paidRace.bookings.every((booking) => booking.status === "CONFIRMED") &&
      (await prisma.bookingSlot.count({
        where: { courtId: courtOne.id, date: raceDate, hour: 12 },
      })) === 1
  );

  const releaseDate = addDays(manilaToday(), 9);
  const releasable = new FormData();
  releasable.set("date", releaseDate);
  releasable.append("courtIds", courtOne.id);
  releasable.append("hours", "12");
  const releasableResult = await createBookingAction({}, releasable);
  ok(
    "a second paid selection is held before payment begins",
    Boolean(releasableResult.hold?.paymentId)
  );
  const releaseForm = new FormData();
  releaseForm.set("paymentId", releasableResult.hold!.paymentId);
  const released = await releaseBookingHoldAction({}, releaseForm);
  ok(
    "the player can explicitly release an unpaid hold and return to bookings",
    released.released === true &&
      released.redirectTo === "/dashboard/bookings"
  );
  ok(
    "releasing removes the court-hour immediately",
    (await prisma.bookingSlot.count({
      where: { courtId: courtOne.id, date: releaseDate, hour: 12 },
    })) === 0
  );
  const releasedPayment = await prisma.bookingPayment.findUnique({
    where: { id: releasableResult.hold!.paymentId },
    include: { bookings: true },
  });
  ok(
    "release closes the payment without recording abandoned bookings",
    releasedPayment?.status === "FAILED" &&
      releasedPayment.failureCode === "player_released" &&
      releasedPayment.bookings.length === 0
  );
  ok(
    "a released hold stays dismissed after refresh",
    (await getActiveBookingHoldForHub({
      userId: player.id,
      hubId: hub.id,
    })) === null
  );

  const eventDate = addDays(manilaToday(), 10);
  const event = await prisma.event.create({
    data: {
      publicId: `cancel-event-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Automatic event cancellation check",
      sport: "pickleball",
      date: eventDate,
      startHour: 18,
      endHour: 20,
      startsAt: manilaInstant(eventDate, 18),
      endsAt: manilaInstant(eventDate, 20),
      capacity: 4,
      registrationFee: 300,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  const eventHoldExpiresAt = new Date(Date.now() + 15 * 60_000);
  const eventPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: player.id,
      hubId: hub.id,
      amount: 309,
      venueAmount: 300,
      platformFee: 9,
      method: "QRPH",
      provider: "paymongo",
      expiresAt: eventHoldExpiresAt,
      eventRegistration: {
        create: {
          eventId: event.id,
          userId: player.id,
          status: "PENDING",
          holdExpiresAt: eventHoldExpiresAt,
        },
      },
    },
    select: { id: true },
  });
  const eventCharge = await chargeBookingPayment({
    paymentId: eventPayment.id,
    userId: player.id,
  });
  const eventCancelForm = new FormData();
  eventCancelForm.set("paymentId", eventPayment.id);
  const eventCancel = await releaseBookingHoldAction({}, eventCancelForm);
  const cancelledEventPayment = await prisma.bookingPayment.findUnique({
    where: { id: eventPayment.id },
    include: { eventRegistration: true },
  });
  ok(
    "cancelling an event checkout safely closes its active QR intent and releases the spot",
    eventCharge.status === "action" &&
      eventCancel.released === true &&
      eventCancel.redirectTo === "/dashboard/bookings" &&
      cancelledEventPayment?.status === "FAILED" &&
      cancelledEventPayment.failureCode === "player_cancelled" &&
      cancelledEventPayment.eventRegistration?.status === "CANCELLED" &&
      paymongo.intents.get(
        cancelledEventPayment.providerPaymentId ?? ""
      )?.status === "cancelled"
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
