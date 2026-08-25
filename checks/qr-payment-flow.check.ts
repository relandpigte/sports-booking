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
const SECOND_PLAYER_EMAIL = "check-qr-flow-player-2@example.test";
const DATE = "2099-12-20";

async function cleanup() {
  await prisma.user.deleteMany({
    where: {
      email: { in: [PARTNER_EMAIL, PLAYER_EMAIL, SECOND_PLAYER_EMAIL] },
    },
  });
}

async function check() {
  process.env.APP_URL = "https://checks.bunal.club";
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
  const secondPlayer = await prisma.user.create({
    data: {
      name: "QR flow second player",
      email: SECOND_PLAYER_EMAIL,
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
  form.append("guestName", "Guest One");
  form.append("guestName", "Guest Two");

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
    include: { payment: true, guests: { orderBy: { createdAt: "asc" } } },
  });
  const intent = paymongo.requests.find((request) =>
    request.url.endsWith("/v1/payment_intents")
  );
  const methods = intent
    ? (
        intent.body as {
          data: { attributes: { payment_method_allowed: string[] } };
        }
      ).data.attributes.payment_method_allowed
    : [];

  ok("paid event registration redirects to its payment screen", redirected);
  ok(
    "paid event registration prepares one direct QR Ph intent automatically",
    paymongo.requests.filter((request) =>
      request.url.endsWith("/v1/payment_intents")
    ).length === 1 && JSON.stringify(methods) === JSON.stringify(["qrph"])
  );
  ok(
    "all named event spots and the QR Ph payment share one 15-minute hold",
    registration?.status === "PENDING" &&
      registration.guests.length === 2 &&
      registration.guests.every(
        (guest) =>
          guest.status === "PENDING" &&
          guest.holdExpiresAt?.getTime() === registration.holdExpiresAt?.getTime()
      ) &&
      registration.payment?.method === "QRPH" &&
      Number(registration.payment.venueAmount) === 1_500 &&
      Number(registration.payment.platformFee) === 45 &&
      registration.payment.providerPaymentId?.startsWith("pi_") === true &&
      registration.payment.qrImageUrl?.startsWith("data:image/") === true &&
      registration.payment.redirectUrl?.startsWith(
        "https://test.paymongo.com/qrph/"
      ) === true &&
      Number(registration.payment.processingFee) === 23.54 &&
      registration.holdExpiresAt != null &&
      registration.holdExpiresAt.getTime() >=
        startedAfter + BOOKING_HOLD_MINUTES * 60_000 &&
      registration.holdExpiresAt.getTime() <=
        createdBefore + BOOKING_HOLD_MINUTES * 60_000
  );

  const retryEvent = await prisma.event.create({
    data: {
      publicId: `qr-retry-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "QR Retry Event",
      sport: "pickleball",
      date: DATE,
      startHour: 20,
      endHour: 22,
      startsAt: manilaInstant(DATE, 20),
      endsAt: manilaInstant(DATE, 22),
      capacity: 8,
      registrationFee: 500,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  const retryForm = new FormData();
  retryForm.set("publicId", retryEvent.publicId);
  try {
    await registerForEventAction({}, retryForm);
  } catch {
    // A paid registration redirects to its payment screen.
  }
  const expiredRetryRegistration = await prisma.eventRegistration.findUnique({
    where: {
      eventId_userId: { eventId: retryEvent.id, userId: player.id },
    },
    include: { payment: true },
  });
  const expiredRetryPayment = expiredRetryRegistration!.payment!;
  const expiredIntent = paymongo.intents.get(
    expiredRetryPayment.providerPaymentId!
  )!;
  const expiredAt = new Date(Date.now() - 1_000);
  paymongo.intents.set(expiredRetryPayment.providerPaymentId!, {
    ...expiredIntent,
    status: "awaiting_next_action",
    expiresAt: expiredAt.toISOString(),
  });
  await prisma.$transaction([
    prisma.eventRegistration.update({
      where: { id: expiredRetryRegistration!.id },
      data: { holdExpiresAt: expiredAt },
    }),
    prisma.bookingPayment.update({
      where: { id: expiredRetryPayment.id },
      data: { expiresAt: expiredAt },
    }),
  ]);
  const { pollBookingPayment } = await import("@/lib/booking-payments");
  await pollBookingPayment(expiredRetryPayment.id);

  try {
    await registerForEventAction({}, retryForm);
  } catch {
    // The replacement hold also redirects to its new payment screen.
  }
  const retriedRegistration = await prisma.eventRegistration.findUnique({
    where: {
      eventId_userId: { eventId: retryEvent.id, userId: player.id },
    },
    include: { payment: true },
  });
  const retiredPayment = await prisma.bookingPayment.findUnique({
    where: { id: expiredRetryPayment.id },
    select: { status: true },
  });
  ok(
    "an expired QR registration gets a fresh hold instead of reopening the expired payment",
    retriedRegistration?.status === "PENDING" &&
      retriedRegistration.holdExpiresAt != null &&
      retriedRegistration.holdExpiresAt > new Date() &&
      retriedRegistration.bookingPaymentId !== expiredRetryPayment.id &&
      retriedRegistration.payment?.providerPaymentId?.startsWith("pi_") ===
        true &&
      retiredPayment?.status === "FAILED"
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

  const initialIntentId = registration!.payment!.providerPaymentId!;
  const initialIntent = paymongo.intents.get(initialIntentId)!;
  paymongo.intents.set(initialIntentId, {
    ...initialIntent,
    status: "succeeded",
    paymentId: "pay_qr_flow_initial",
  });
  await getPaymentStatus(
    new Request("https://www.bunal.club/api/payments/status"),
    { params: Promise.resolve({ paymentId: registration!.bookingPaymentId! }) }
  );
  const confirmedGroup = await prisma.eventRegistration.findUnique({
    where: { id: registration!.id },
    include: { guests: true },
  });
  ok(
    "successful group payment confirms the lead and every named guest",
    confirmedGroup?.status === "CONFIRMED" &&
      confirmedGroup.guests.every((guest) => guest.status === "CONFIRMED")
  );

  const { addEventGuestSlotsAction } = await import("@/lib/event-actions");
  const addForm = new FormData();
  addForm.set("publicId", event.publicId);
  addForm.append("guestName", "Guest Three");
  addForm.append("guestName", "Guest Four");
  let addOnRedirected = false;
  try {
    await addEventGuestSlotsAction({}, addForm);
  } catch (error) {
    addOnRedirected = error instanceof Error && error.message.includes("redirect");
  }
  const addOnPayment = await prisma.bookingPayment.findFirst({
    where: {
      userId: player.id,
      eventGuestSlots: {
        some: { registration: { eventId: event.id, userId: player.id } },
      },
      id: { not: registration!.bookingPaymentId! },
    },
    orderBy: { createdAt: "desc" },
    include: { eventGuestSlots: true },
  });
  ok(
    "a confirmed player can hold named guest add-ons in one incremental payment",
    addOnRedirected &&
      addOnPayment?.eventGuestSlots.length === 2 &&
      addOnPayment.eventGuestSlots.every(
        (guest) => guest.status === "PENDING"
      ) &&
      Number(addOnPayment.venueAmount) === 1_000 &&
      Number(addOnPayment.platformFee) === 30
  );

  const expiredAddOnIntent = paymongo.intents.get(
    addOnPayment!.providerPaymentId!
  )!;
  const expiredAddOnAt = new Date(Date.now() - 1_000);
  paymongo.intents.set(addOnPayment!.providerPaymentId!, {
    ...expiredAddOnIntent,
    status: "awaiting_next_action",
    expiresAt: expiredAddOnAt.toISOString(),
  });
  await prisma.$transaction([
    prisma.eventGuestSlot.updateMany({
      where: { bookingPaymentId: addOnPayment!.id },
      data: { holdExpiresAt: expiredAddOnAt },
    }),
    prisma.bookingPayment.update({
      where: { id: addOnPayment!.id },
      data: { expiresAt: expiredAddOnAt },
    }),
  ]);
  await pollBookingPayment(addOnPayment!.id);
  try {
    await addEventGuestSlotsAction({}, addForm);
  } catch {
    // The replacement guest hold redirects to its new payment screen.
  }
  const retriedAddOnPayment = await prisma.bookingPayment.findFirst({
    where: {
      userId: player.id,
      id: { notIn: [registration!.bookingPaymentId!, addOnPayment!.id] },
      eventGuestSlots: {
        some: { registration: { eventId: event.id, userId: player.id } },
      },
    },
    orderBy: { createdAt: "desc" },
    include: { eventGuestSlots: true },
  });
  const retiredAddOnPayment = await prisma.bookingPayment.findUnique({
    where: { id: addOnPayment!.id },
    select: { status: true },
  });
  ok(
    "expired guest add-ons get a fresh hold instead of reopening the expired payment",
    retiredAddOnPayment?.status === "FAILED" &&
      retriedAddOnPayment?.status === "PENDING" &&
      retriedAddOnPayment.eventGuestSlots.length === 2 &&
      retriedAddOnPayment.eventGuestSlots.every(
        (guest) =>
          guest.status === "PENDING" &&
          guest.holdExpiresAt != null &&
          guest.holdExpiresAt > new Date()
      )
  );

  const capacityEvent = await prisma.event.create({
    data: {
      publicId: `qr-capacity-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "QR Capacity Event",
      sport: "pickleball",
      date: DATE,
      startHour: 12,
      endHour: 14,
      startsAt: manilaInstant(DATE, 12),
      endsAt: manilaInstant(DATE, 14),
      capacity: 8,
      registrationFee: 500,
      status: "PUBLISHED",
      publishedAt: new Date(),
      registrations: {
        create: {
          userId: secondPlayer.id,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          guests: {
            create: ["Existing A", "Existing B", "Existing C", "Existing D"].map(
              (name) => ({ name, status: "CONFIRMED", confirmedAt: new Date() })
            ),
          },
        },
      },
    },
  });
  const oversizedForm = new FormData();
  oversizedForm.set("publicId", capacityEvent.publicId);
  for (const name of ["A", "B", "C", "D"]) {
    oversizedForm.append("guestName", name);
  }
  const oversized = await registerForEventAction({}, oversizedForm);
  const oversizedRegistrationCount = await prisma.eventRegistration.count({
    where: { eventId: capacityEvent.id, userId: player.id },
  });
  ok(
    "a group is rejected atomically when all requested spots do not fit",
    oversized.message?.includes("Only 3 spots are available") === true &&
      oversizedRegistrationCount === 0
  );

  const addOnIntentId = retriedAddOnPayment!.providerPaymentId!;
  const addOnIntent = paymongo.intents.get(addOnIntentId)!;
  paymongo.intents.set(addOnIntentId, {
    ...addOnIntent,
    status: "succeeded",
    paymentId: "pay_qr_flow_add_on",
  });
  stubRequestContext(player);
  await getPaymentStatus(
    new Request("https://www.bunal.club/api/payments/status"),
    { params: Promise.resolve({ paymentId: retriedAddOnPayment!.id }) }
  );
  const { getPublicEvent } = await import("@/lib/events");
  const publicEvent = await getPublicEvent(event.publicId, player.id);
  const settledAddOn = await prisma.bookingPayment.findUnique({
    where: { id: retriedAddOnPayment!.id },
    select: { status: true },
  });
  ok(
    "paid add-ons confirm capacity once without a refund",
    publicEvent?.confirmedCount === 5 &&
      publicEvent.remainingSpots === 3 &&
      publicEvent.viewerRegistration?.confirmedGuestNames.length === 4 &&
      publicEvent.viewerRegistration.confirmedSlotCount === 5 &&
      settledAddOn?.status === "SUCCEEDED" &&
      paymongo.refunds.length === 0
  );
}

run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
