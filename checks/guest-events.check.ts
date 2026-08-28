// Guest event registration keeps contact ownership private while preserving
// public rosters, organizer operations, and the existing payment ledger.
//
//   npm run check:guest-events
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubPublicGuestRequestContext } from "./harness";
import { manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-guest-events-partner@example.test";
const GUEST_EMAIL = "check-guest-events-player@example.test";
const DUAL_EMAIL = "check-guest-events-dual@example.test";
const DATE = "2099-12-28";

async function cleanup() {
  await prisma.guestReservation.deleteMany({
    where: { email: GUEST_EMAIL },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, DUAL_EMAIL] } },
  });
}

async function check() {
  const paymentPageSource = await readFile(
    path.join(
      process.cwd(),
      "src/app/events/[publicId]/pay/[paymentId]/page.tsx"
    ),
    "utf8"
  );
  ok(
    "guest event checkout uses nullable public viewer access instead of forcing login",
    paymentPageSource.includes('import { getViewer } from "@/lib/dal";') &&
      !paymentPageSource.includes("getCurrentUser")
  );

  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "Guest event partner",
      email: PARTNER_EMAIL,
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true, email: true, role: true },
  });
  let cookieGuestReservationId: string | null = null;
  stubPublicGuestRequestContext({
    onCookieSet: (guestReservationId) => {
      cookieGuestReservationId = guestReservationId;
    },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Guest Event Hub",
      slug: `guest-event-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
    },
    select: { id: true },
  });
  const freeEvent = await prisma.event.create({
    data: {
      publicId: `guest-free-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Free Guest Open Play",
      sport: "pickleball",
      date: DATE,
      startHour: 14,
      endHour: 16,
      startsAt: manilaInstant(DATE, 14),
      endsAt: manilaInstant(DATE, 16),
      capacity: 4,
      registrationFee: 0,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true, publicId: true },
  });
  const { registerGuestForEventAction } = await import("@/lib/event-actions");
  const guestForm = new FormData();
  guestForm.set("publicId", freeEvent.publicId);
  guestForm.set("guestLeadName", "Guest Action Player");
  guestForm.set("guestPhone", "+639179876543");
  guestForm.set("guestEmail", GUEST_EMAIL);
  guestForm.append("guestName", "Action Companion");
  const guestActionResult = await registerGuestForEventAction({}, guestForm);
  const guestActionRegistration = await prisma.eventRegistration.findFirst({
    where: { eventId: freeEvent.id },
    include: { guestReservation: true, guests: true },
  });
  ok(
    "a signed-out guest can register a free group without creating an account",
    guestActionResult.success === "You're registered for this event." &&
      guestActionRegistration?.status === "CONFIRMED" &&
      guestActionRegistration.userId === null &&
      guestActionRegistration.guestReservation?.name === "Guest Action Player" &&
      guestActionRegistration.guests[0]?.name === "Action Companion"
  );
  ok(
    "guest registration writes private return access for the reservation",
    cookieGuestReservationId === guestActionRegistration?.guestReservationId
  );
  const event = await prisma.event.create({
    data: {
      publicId: `guest-event-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Guest Open Play",
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
    select: { id: true, publicId: true },
  });
  const accessExpiresAt = new Date("2100-03-28T12:00:00.000Z");
  const guest = await prisma.guestReservation.create({
    data: {
      name: "Guest Event Player",
      phone: "+639171234567",
      email: GUEST_EMAIL,
      accessExpiresAt,
    },
    select: { id: true },
  });
  const payment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      guestReservationId: guest.id,
      hubId: hub.id,
      amount: 1_030,
      venueAmount: 1_000,
      platformFee: 30,
      processingFee: 0,
      method: "MANUAL",
      collectionMode: "MANUAL",
      status: "SUCCEEDED",
      provider: "manual",
      expiresAt: accessExpiresAt,
      paidAt: new Date(),
      eventRegistration: {
        create: {
          eventId: event.id,
          guestReservationId: guest.id,
          status: "PENDING",
          holdExpiresAt: accessExpiresAt,
          guests: {
            create: {
              name: "Guest Companion",
              status: "PENDING",
              holdExpiresAt: accessExpiresAt,
            },
          },
        },
      },
    },
    select: { id: true },
  });
  await prisma.eventGuestSlot.updateMany({
    where: { registration: { guestReservationId: guest.id } },
    data: { bookingPaymentId: payment.id },
  });

  const { settleBookingPayment } = await import("@/lib/booking-payments");
  const settled = await settleBookingPayment(payment.id);
  const registration = await prisma.eventRegistration.findUnique({
    where: { guestReservationId: guest.id },
    include: { guests: true },
  });
  ok(
    "guest event payment settlement confirms the lead and initial companions",
    settled.status === "confirmed" &&
      registration?.status === "CONFIRMED" &&
      registration.guests[0]?.status === "CONFIRMED"
  );
  ok(
    "guest event payment accrues the service fee exactly once",
    (await prisma.serviceFeeEntry.count({
      where: { bookingPaymentId: payment.id },
    })) === 1
  );

  const { getGuestBookingPaymentScreen } = await import(
    "@/lib/booking-payments"
  );
  const paymentScreen = await getGuestBookingPaymentScreen(
    payment.id,
    guest.id
  );
  ok(
    "the guest-owned payment screen resolves its event without an account",
    paymentScreen?.payment.event?.publicId === event.publicId &&
      paymentScreen.payment.event.spotCount === 2
  );

  const abandonedGuest = await prisma.guestReservation.create({
    data: {
      name: "Abandoned Guest Event Player",
      phone: "+639170000000",
      email: GUEST_EMAIL,
      accessExpiresAt,
    },
  });
  const abandonedPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      guestReservationId: abandonedGuest.id,
      hubId: hub.id,
      amount: 515,
      venueAmount: 500,
      platformFee: 15,
      processingFee: 0,
      method: "QRPH",
      collectionMode: "AUTOMATIC",
      status: "PENDING",
      provider: "paymongo",
      providerPaymentId: "pi_expired_guest_event_check",
      failureCode: "payment_intent_expired",
      failureMessage: "The QR payment expired without a charge.",
      expiresAt: new Date(Date.now() - 60_000),
      eventRegistration: {
        create: {
          eventId: event.id,
          guestReservationId: abandonedGuest.id,
          status: "PENDING",
          holdExpiresAt: new Date(Date.now() - 60_000),
        },
      },
    },
    select: { id: true },
  });
  const { expireBookingHolds } = await import("@/lib/booking-payments");
  await expireBookingHolds();
  ok(
    "an unpaid expired guest event hold is removed instead of recorded",
    (await prisma.eventRegistration.findUnique({
      where: { guestReservationId: abandonedGuest.id },
    })) === null
  );
  ok(
    "the abandoned event payment remains as a failed audit ledger",
    (await prisma.bookingPayment.findUnique({
      where: { id: abandonedPayment.id },
    }))?.status === "FAILED"
  );

  const { getPublicEvent, listOwnerEventRegistrations } = await import(
    "@/lib/events"
  );
  const publicEvent = await getPublicEvent(event.publicId, null, guest.id);
  ok(
    "the public roster shows the guest lead's submitted full name",
    publicEvent?.attendees.some(
      (attendee) => attendee.name === "Guest Event Player"
    ) === true
  );
  ok(
    "the private guest identity restores registration status on the event",
    publicEvent?.viewerRegistration?.status === "CONFIRMED" &&
      publicEvent.viewerRegistration.confirmedSlotCount === 2
  );
  const ownerRows = await listOwnerEventRegistrations(event.id, partner.id);
  ok(
    "organizers receive guest contact details and a guest-checkout marker",
    ownerRows?.[0]?.player.isGuest === true &&
      ownerRows[0].player.name === "Guest Event Player" &&
      ownerRows[0].player.phone === "+639171234567" &&
      ownerRows[0].player.email === GUEST_EMAIL
  );

  let rejectedDualOwner = false;
  try {
    const account = await prisma.user.create({
      data: {
        email: DUAL_EMAIL,
        role: "PLAYER",
      },
    });
    await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        userId: account.id,
        guestReservationId: guest.id,
        status: "WAITLISTED",
      },
    });
  } catch {
    rejectedDualOwner = true;
  }
  ok(
    "the database rejects an event registration with two owners",
    rejectedDualOwner
  );

  let rejectedOwnerless = false;
  try {
    await prisma.eventRegistration.create({
      data: { eventId: event.id, status: "WAITLISTED" },
    });
  } catch {
    rejectedOwnerless = true;
  }
  ok(
    "the database rejects an event registration without an owner",
    rejectedOwnerless
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
