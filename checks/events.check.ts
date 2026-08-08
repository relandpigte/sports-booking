// Open play court protection, public counts, payment settlement, and cancellation.
//
//   npm run check:events
import crypto from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { type OperatingHours, WEEKDAYS } from "@/lib/constants";
import { manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-events-partner@example.test";
const PLAYER_EMAILS = [
  "check-events-player-1@example.test",
  "check-events-player-2@example.test",
  "check-events-player-3@example.test",
];
const DATE = "2099-12-12";

const operatingHours = Object.fromEntries(
  WEEKDAYS.map(({ value }) => [
    value,
    { closed: false, open: "06:00", close: "22:00" },
  ])
) as OperatingHours;

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, ...PLAYER_EMAILS] } },
  });
}

async function check() {
  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "Events check partner",
      email: PARTNER_EMAIL,
      passwordHash: "x",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true, email: true },
  });
  const players = await Promise.all(
    PLAYER_EMAILS.map((email, index) =>
      prisma.user.create({
        data: {
          name: `Events check player ${index + 1}`,
          email,
          passwordHash: "x",
          role: "PLAYER",
        },
        select: { id: true, email: true },
      })
    )
  );
  const gateway = await prisma.partnerGateway.create({
    data: {
      userId: partner.id,
      provider: "paymongo",
      publicKey: "pk_test_events",
      secretKeyEnc: "check",
      webhookSecretEnc: "check",
      secretKeyHint: "…test",
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
    select: { id: true },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Events Check Hub",
      slug: `events-check-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
      operatingHours,
      courts: {
        create: [
          { name: "Court A", courtType: "covered", hourlyRate: 500 },
          { name: "Court B", courtType: "open", hourlyRate: 400 },
        ],
      },
    },
    select: { id: true, courts: { orderBy: { name: "asc" }, select: { id: true } } },
  });
  const [courtA, courtB] = hub.courts;
  const event = await prisma.event.create({
    data: {
      publicId: `check-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Friday Night Open Play",
      sport: "pickleball",
      date: DATE,
      startHour: 9,
      endHour: 12,
      startsAt: manilaInstant(DATE, 9),
      endsAt: manilaInstant(DATE, 12),
      capacity: 2,
      registrationFee: 500,
      status: "PUBLISHED",
      publishedAt: new Date(),
      courts: { create: [{ courtId: courtA.id }, { courtId: courtB.id }] },
      slots: {
        create: [courtA.id, courtB.id].flatMap((courtId) =>
          [9, 10, 11].map((hour) => ({ courtId, date: DATE, hour }))
        ),
      },
    },
    select: { id: true, publicId: true },
  });

  stubRequestContext(partner);
  const { getBookedHours, getCourtOccupancy, getHubCourtOccupancies } =
    await import("@/lib/bookings");
  ok(
    "published event slots block ordinary court booking availability",
    (await getBookedHours(courtA.id, DATE)).join(",") === "9,10,11"
  );
  ok(
    "availability distinguishes Open Play from ordinary bookings",
    (await getCourtOccupancy(courtA.id, DATE)).openPlayHours.join(",") ===
      "9,10,11"
  );
  const hubOccupancy = await getHubCourtOccupancies(
    hub.id,
    DATE,
    hub.courts.map((court) => court.id)
  );
  ok(
    "the comparison snapshot includes every court and its Open Play hours",
    hubOccupancy.length === 2 &&
      hubOccupancy.every(
        (court) => court.openPlayHours.join(",") === "9,10,11"
      )
  );

  let duplicateBlocked = false;
  try {
    await prisma.bookingSlot.create({
      data: { courtId: courtA.id, date: DATE, hour: 10, eventId: event.id },
    });
  } catch (error) {
    duplicateBlocked =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
  ok("the database prevents a race from double-claiming an event hour", duplicateBlocked);

  const payment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: players[0].id,
      hubId: hub.id,
      amount: 515,
      venueAmount: 500,
      platformFee: 15,
      method: "CARD",
      status: "SUCCEEDED",
      provider: "paymongo",
      expiresAt: new Date("2099-12-12T00:00:00Z"),
      paidAt: new Date(),
      eventRegistration: {
        create: {
          eventId: event.id,
          userId: players[0].id,
          status: "PENDING",
          holdExpiresAt: new Date("2099-12-12T00:00:00Z"),
        },
      },
    },
    select: { id: true },
  });

  const { recoverPaidEventRegistration, settleBookingPayment } = await import(
    "@/lib/booking-payments"
  );
  const settled = await settleBookingPayment(payment.id);
  const settledAgain = await settleBookingPayment(payment.id);
  const registration = await prisma.eventRegistration.findUnique({
    where: { bookingPaymentId: payment.id },
    select: { status: true },
  });
  ok(
    "a successful event payment confirms the held player spot",
    settled.status === "confirmed" && registration?.status === "CONFIRMED"
  );
  ok(
    "event payment settlement accrues the 3% fee exactly once",
    settledAgain.status === "already" &&
      (await prisma.serviceFeeEntry.count({ where: { bookingPaymentId: payment.id } })) === 1
  );

  const latePayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: players[1].id,
      hubId: hub.id,
      amount: 515,
      venueAmount: 500,
      platformFee: 15,
      method: "GCASH",
      status: "SUCCEEDED",
      provider: "paymongo",
      providerPaymentId: "cs_late_event_check",
      expiresAt: new Date(Date.now() - 30_000),
      paidAt: new Date(),
      eventRegistration: {
        create: {
          eventId: event.id,
          userId: players[1].id,
          status: "EXPIRED",
        },
      },
    },
    select: { id: true },
  });
  const recovered = await recoverPaidEventRegistration({
    eventId: event.id,
    userId: players[1].id,
  });
  const recoveredRegistration = await prisma.eventRegistration.findUnique({
    where: { bookingPaymentId: latePayment.id },
    select: { status: true },
  });
  ok(
    "a paid expired registration is restored when event capacity remains",
    recovered.status === "confirmed" &&
      recoveredRegistration?.status === "CONFIRMED" &&
      (await prisma.serviceFeeEntry.count({
        where: { bookingPaymentId: latePayment.id },
      })) === 1
  );
  await prisma.eventRegistration.create({
    data: { eventId: event.id, userId: players[2].id, status: "WAITLISTED" },
  });
  stubRequestContext(players[0]);
  const {
    getOwnerEventDetails,
    getMyUpcomingEventRegistrationSummary,
    getPublicEvent,
    listMyEventRegistrations,
    listPublicEvents,
  } = await import("@/lib/events");
  const publicEvent = await getPublicEvent(event.publicId);
  ok(
    "the public event reports capacity and a free waitlist without exposing emails",
    publicEvent?.full === true &&
      publicEvent.confirmedCount === 2 &&
      publicEvent.waitlistedCount === 1 &&
      publicEvent.attendees.every((attendee) => !("email" in attendee))
  );
  const upcomingEvents = await listPublicEvents("upcoming");
  ok(
    "the upcoming discovery view includes the next published event",
    upcomingEvents.some((item) => item.publicId === event.publicId)
  );

  const playerRegistrations = await listMyEventRegistrations();
  ok(
    "a player sees confirmed events with payment details under My Bookings",
    playerRegistrations.upcoming.some(
      (item) =>
        item.event.publicId === event.publicId &&
        item.status === "CONFIRMED" &&
        item.payment?.status === "SUCCEEDED" &&
        item.event.courts.length === 2
    )
  );
  const eventSummary = await getMyUpcomingEventRegistrationSummary();
  ok(
    "the player dashboard counts and selects confirmed event registrations",
    eventSummary.count === 1 &&
      eventSummary.next?.event.publicId === event.publicId
  );
  stubRequestContext(partner);

  const ownerDetails = await getOwnerEventDetails(event.publicId, partner.id);
  const hiddenFromAnotherOwner = await getOwnerEventDetails(
    event.publicId,
    "not-the-event-owner"
  );
  ok(
    "the owner event workspace contains private registration and revenue details",
    ownerDetails?.confirmedCount === 2 &&
      ownerDetails.waitlistedCount === 1 &&
      ownerDetails.remainingSpots === 0 &&
      ownerDetails.finance.successfulPayments === 2 &&
      ownerDetails.finance.partnerRevenue === 1_000 &&
      ownerDetails.finance.platformFees === 30 &&
      ownerDetails.finance.checkoutSubtotal === 1_030
  );
  ok(
    "event management details are hidden from other partners",
    hiddenFromAnotherOwner === null
  );

  await prisma.hub.update({
    where: { id: hub.id },
    data: {
      bookingStatus: "MAINTENANCE",
      bookingStatusMessage: "Court maintenance is in progress.",
    },
  });
  const pausedPublicEvent = await getPublicEvent(event.publicId);
  ok(
    "a paused venue is removed from event discovery but keeps its public status message",
    !(await listPublicEvents("upcoming")).some(
      (item) => item.publicId === event.publicId
    ) &&
      pausedPublicEvent?.hub.bookingStatus === "MAINTENANCE" &&
      pausedPublicEvent.hub.bookingStatusMessage ===
        "Court maintenance is in progress."
  );
  await prisma.hub.update({
    where: { id: hub.id },
    data: { bookingStatus: "OPEN", bookingStatusMessage: null },
  });

  const organizerEvent = await prisma.event.create({
    data: {
      publicId: `check-organizer-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Organizer guest capacity check",
      sport: "pickleball",
      date: DATE,
      startHour: 13,
      endHour: 14,
      startsAt: manilaInstant(DATE, 13),
      endsAt: manilaInstant(DATE, 14),
      capacity: 2,
      registrationFee: 500,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true, publicId: true },
  });
  const {
    addOrganizerEventGuestsAction,
    cancelEventAction,
    deleteCancelledEventAction,
    removeOrganizerEventGuestAction,
  } = await import("@/lib/event-actions");
  const paymentsBeforeOrganizerGuests = await prisma.bookingPayment.count();
  const addOrganizerGuestsForm = new FormData();
  addOrganizerGuestsForm.set("eventId", organizerEvent.id);
  addOrganizerGuestsForm.append("guestName", "Complimentary Guest One");
  addOrganizerGuestsForm.append("guestName", "Complimentary Guest Two");
  const organizerGuestsAdded = await addOrganizerEventGuestsAction(
    {},
    addOrganizerGuestsForm
  );
  const organizerGuestRows = await prisma.eventOrganizerGuest.findMany({
    where: { eventId: organizerEvent.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true },
  });
  ok(
    "the event owner can add named complimentary guests without a payment",
    organizerGuestsAdded.success?.includes("2 complimentary guests") === true &&
      organizerGuestRows.length === 2 &&
      organizerGuestRows.every((guest) => guest.status === "CONFIRMED") &&
      (await prisma.bookingPayment.count()) === paymentsBeforeOrganizerGuests
  );

  const overCapacityForm = new FormData();
  overCapacityForm.set("eventId", organizerEvent.id);
  overCapacityForm.append("guestName", "One guest too many");
  const overCapacity = await addOrganizerEventGuestsAction(
    {},
    overCapacityForm
  );
  const fullOrganizerEvent = await getPublicEvent(organizerEvent.publicId);
  ok(
    "organizer guests use atomic event capacity and cannot oversell the event",
    overCapacity.message?.includes("No spots") === true &&
      (await prisma.eventOrganizerGuest.count({
        where: { eventId: organizerEvent.id, status: "CONFIRMED" },
      })) === 2 &&
      fullOrganizerEvent?.confirmedCount === 2 &&
      fullOrganizerEvent.remainingSpots === 0 &&
      fullOrganizerEvent.attendees.every(
        (attendee) =>
          attendee.name === null && attendee.playerName === "Guest of organizer"
      )
  );

  const removeOrganizerGuestForm = new FormData();
  removeOrganizerGuestForm.set("guestId", organizerGuestRows[0].id);
  const organizerGuestRemoved = await removeOrganizerEventGuestAction(
    {},
    removeOrganizerGuestForm
  );
  const organizerEventAfterRemoval = await getOwnerEventDetails(
    organizerEvent.publicId,
    partner.id
  );
  ok(
    "removing a complimentary guest releases capacity without a refund",
    organizerGuestRemoved.success?.includes("removed") === true &&
      organizerEventAfterRemoval?.confirmedCount === 1 &&
      organizerEventAfterRemoval.remainingSpots === 1 &&
      organizerEventAfterRemoval.organizerGuests.some(
        (guest) => guest.status === "CANCELLED"
      ) &&
      (await prisma.bookingPayment.count()) === paymentsBeforeOrganizerGuests
  );

  const { buildEventMetadata } = await import("@/lib/event-metadata");
  const eventMetadata = buildEventMetadata({
    publicId: event.publicId,
    title: "Friday Night Open Play",
    description: "Check fixture event.",
  });
  const openGraph = eventMetadata.openGraph as
    | { title?: string; url?: string }
    | undefined;
  ok(
    "shared event metadata keeps Messenger on the exact event page",
    eventMetadata.alternates?.canonical ===
      `https://www.bunal.club/events/${event.publicId}` &&
      openGraph?.url === `https://www.bunal.club/events/${event.publicId}` &&
      openGraph.title === "Friday Night Open Play — Bunal.club"
  );

  const form = new FormData();
  form.set("eventId", event.id);
  form.set("reason", "Venue maintenance check.");
  form.set("refund", "none");
  const cancelled = await cancelEventAction({}, form);
  const afterCancel = await prisma.event.findUnique({
    where: { id: event.id },
    select: { status: true, slots: { select: { id: true } } },
  });
  ok(
    "owner cancellation releases every protected court hour",
    cancelled.success?.includes("released") === true &&
      afterCancel?.status === "CANCELLED" &&
      afterCancel.slots.length === 0
  );

  const paidDeleteForm = new FormData();
  paidDeleteForm.set("eventId", event.id);
  const paidDelete = await deleteCancelledEventAction({}, paidDeleteForm);
  ok(
    "cancelled events with payment history remain available for audit and refunds",
    paidDelete.message?.includes("payment history") === true &&
      (await prisma.event.count({ where: { id: event.id } })) === 1
  );

  const emptyCancelledEvent = await prisma.event.create({
    data: {
      publicId: `check-empty-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Cancelled event without payments",
      sport: "pickleball",
      date: DATE,
      startHour: 14,
      endHour: 16,
      startsAt: manilaInstant(DATE, 14),
      endsAt: manilaInstant(DATE, 16),
      capacity: 12,
      registrationFee: 0,
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: "No registrations received.",
    },
    select: { id: true },
  });
  const emptyDeleteForm = new FormData();
  emptyDeleteForm.set("eventId", emptyCancelledEvent.id);
  const emptyDelete = await deleteCancelledEventAction({}, emptyDeleteForm);
  ok(
    "partners can permanently delete cancelled events without payment history",
    emptyDelete.success?.includes("deleted") === true &&
      (await prisma.event.count({
        where: { id: emptyCancelledEvent.id },
      })) === 0
  );
}

run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
