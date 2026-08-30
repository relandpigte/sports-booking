// Open play court protection, public counts, payment settlement, and cancellation.
//
//   npm run check:events
import crypto from "node:crypto";

import { Prisma, PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { type OperatingHours, WEEKDAYS } from "@/lib/constants";
import { addDays, manilaInstant } from "@/lib/time";

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
    select: { id: true, email: true, role: true, partnerStatus: true },
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
        select: { id: true, email: true, role: true },
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

  const movableBooking = await prisma.booking.create({
    data: {
      hubId: hub.id,
      courtId: courtA.id,
      userId: players[0].id,
      date: DATE,
      startHour: 13,
      endHour: 14,
      hours: 1,
      startsAt: manilaInstant(DATE, 13),
      endsAt: manilaInstant(DATE, 14),
      status: "CONFIRMED",
      slots: {
        create: { courtId: courtA.id, date: DATE, hour: 13 },
      },
    },
    select: { id: true },
  });
  const moveOccupancy = await getHubCourtOccupancies(
    hub.id,
    DATE,
    hub.courts.map((court) => court.id),
    movableBooking.id
  );
  const moveCourtA = moveOccupancy.find((court) => court.courtId === courtA.id);
  ok(
    "the reschedule comparison frees only the moving booking's own hours",
    moveCourtA?.bookedHours.join(",") === "9,10,11" &&
      moveCourtA.openPlayHours.join(",") === "9,10,11"
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

  const manualReleaseEvent = await prisma.event.create({
    data: {
      publicId: `check-release-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Manual spot release check",
      sport: "pickleball",
      date: DATE,
      startHour: 18,
      endHour: 20,
      startsAt: manilaInstant(DATE, 18),
      endsAt: manilaInstant(DATE, 20),
      capacity: 3,
      registrationFee: 150,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true, publicId: true },
  });
  const manualReleaseExpiresAt = new Date(Date.now() + 15 * 60_000);
  const manualReleasePayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      userId: players[0].id,
      hubId: hub.id,
      amount: 300,
      venueAmount: 300,
      platformFee: 0,
      method: "MANUAL",
      collectionMode: "MANUAL",
      provider: "manual",
      expiresAt: manualReleaseExpiresAt,
      eventRegistration: {
        create: {
          eventId: manualReleaseEvent.id,
          userId: players[0].id,
          status: "PENDING",
          holdExpiresAt: manualReleaseExpiresAt,
        },
      },
    },
    select: { id: true },
  });
  const manualReleaseRegistration = await prisma.eventRegistration.findUniqueOrThrow({
    where: { bookingPaymentId: manualReleasePayment.id },
    select: { id: true },
  });
  await prisma.eventGuestSlot.create({
    data: {
      eventRegistrationId: manualReleaseRegistration.id,
      bookingPaymentId: manualReleasePayment.id,
      name: "Release Check Guest",
      status: "PENDING",
      holdExpiresAt: manualReleaseExpiresAt,
    },
  });
  const { releaseBookingHoldAction } = await import(
    "@/lib/booking-payment-actions"
  );
  const manualReleaseForm = new FormData();
  manualReleaseForm.set("paymentId", manualReleasePayment.id);
  const manualRelease = await releaseBookingHoldAction({}, manualReleaseForm);
  const [releasedManualPayment, releasedManualEvent] = await Promise.all([
    prisma.bookingPayment.findUnique({
      where: { id: manualReleasePayment.id },
      include: { eventRegistration: true, eventGuestSlots: true },
    }),
    getPublicEvent(manualReleaseEvent.publicId, players[0].id),
  ]);
  ok(
    "a player can cancel a manual event checkout and immediately release every held spot",
    manualRelease.released === true &&
      releasedManualPayment?.status === "FAILED" &&
      releasedManualPayment.failureCode === "player_released" &&
      releasedManualPayment.eventRegistration?.status === "CANCELLED" &&
      releasedManualPayment.eventGuestSlots.every(
        (guest) => guest.status === "CANCELLED"
      ) &&
      releasedManualEvent?.remainingSpots === 3 &&
      releasedManualEvent.viewerRegistration?.status === "CANCELLED"
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
    saveEventAction,
  } = await import("@/lib/event-actions");

  const recurringForm = new FormData();
  recurringForm.set("hubId", hub.id);
  recurringForm.set("title", "Weekly recurring check");
  recurringForm.set("description", "Three independent weekly events.");
  recurringForm.set("sport", "pickleball");
  recurringForm.set("date", DATE);
  recurringForm.set("startHour", "15");
  recurringForm.set("endHour", "17");
  recurringForm.set("capacity", "16");
  recurringForm.set("registrationFee", "0");
  recurringForm.append("courtIds", courtA.id);
  recurringForm.set("recurrence", "weekly");
  recurringForm.set("repeatUntil", addDays(DATE, 14));
  recurringForm.set("intent", "publish");
  let recurringRedirected = false;
  try {
    await saveEventAction({}, recurringForm);
  } catch (error) {
    recurringRedirected =
      error instanceof Error && error.message.includes("redirect");
  }
  const recurringEvents = await prisma.event.findMany({
    where: { title: "Weekly recurring check", hubId: hub.id },
    orderBy: { seriesPosition: "asc" },
    select: {
      publicId: true,
      date: true,
      status: true,
      seriesId: true,
      seriesPosition: true,
      slots: { select: { hour: true } },
    },
  });
  ok(
    "weekly creation publishes each occurrence with independent court protection",
    recurringRedirected &&
      recurringEvents.length === 3 &&
      recurringEvents.map((item) => item.date).join(",") ===
        [DATE, addDays(DATE, 7), addDays(DATE, 14)].join(",") &&
      recurringEvents.every(
        (item, index) =>
          item.status === "PUBLISHED" &&
          item.seriesId === recurringEvents[0]?.seriesId &&
          item.seriesPosition === index + 1 &&
          item.slots.length === 2
      )
  );
  const recurringOwnerView = recurringEvents[0]
    ? await getOwnerEventDetails(recurringEvents[0].publicId, partner.id)
    : null;
  ok(
    "the owner workspace links every occurrence in a weekly series",
    recurringOwnerView?.seriesOccurrences.length === 3 &&
      recurringOwnerView.seriesOccurrences[2]?.date === addDays(DATE, 14)
  );

  const conflictingRecurringForm = new FormData();
  conflictingRecurringForm.set("hubId", hub.id);
  conflictingRecurringForm.set("title", "Conflicting weekly check");
  conflictingRecurringForm.set("sport", "pickleball");
  conflictingRecurringForm.set("date", DATE);
  conflictingRecurringForm.set("startHour", "10");
  conflictingRecurringForm.set("endHour", "11");
  conflictingRecurringForm.set("capacity", "16");
  conflictingRecurringForm.set("registrationFee", "0");
  conflictingRecurringForm.append("courtIds", courtA.id);
  conflictingRecurringForm.set("recurrence", "weekly");
  conflictingRecurringForm.set("repeatUntil", addDays(DATE, 7));
  conflictingRecurringForm.set("intent", "publish");
  const recurringConflict = await saveEventAction(
    {},
    conflictingRecurringForm
  );
  ok(
    "one court conflict prevents the entire weekly series from being created",
    Boolean(recurringConflict.errors?.courtIds?.includes("Court A")) &&
      (await prisma.event.count({
        where: { title: "Conflicting weekly check", hubId: hub.id },
      })) === 0
  );

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
    "the event owner can add named complimentary players without a booking payment",
    organizerGuestsAdded.success?.includes("2 complimentary players") === true &&
      organizerGuestRows.length === 2 &&
      organizerGuestRows.every((guest) => guest.status === "CONFIRMED") &&
      (await prisma.bookingPayment.count()) === paymentsBeforeOrganizerGuests &&
      (await prisma.serviceFeeEntry.count({
        where: {
          eventOrganizerGuestId: { in: organizerGuestRows.map((guest) => guest.id) },
          type: "CHARGE",
          amount: 15,
        },
      })) === 2
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
    "removing a complimentary player releases capacity and reverses its fee",
    organizerGuestRemoved.success?.includes("removed") === true &&
      organizerEventAfterRemoval?.confirmedCount === 1 &&
      organizerEventAfterRemoval.remainingSpots === 1 &&
      organizerEventAfterRemoval.finance.platformFees === 15 &&
      organizerEventAfterRemoval.organizerGuests.some(
        (guest) => guest.status === "CANCELLED"
      ) &&
      (await prisma.serviceFeeEntry.count({
        where: {
          eventOrganizerGuestId: organizerGuestRows[0].id,
          type: "REFUND",
          amount: -15,
        },
      })) === 1 &&
      (await prisma.bookingPayment.count()) === paymentsBeforeOrganizerGuests
  );

  const removeOrganizerGuestAgain = await removeOrganizerEventGuestAction(
    {},
    removeOrganizerGuestForm
  );
  ok(
    "organizer-player fee reversal is idempotent",
    removeOrganizerGuestAgain.message?.includes("already been removed") === true &&
      (await prisma.serviceFeeEntry.count({
        where: {
          eventOrganizerGuestId: organizerGuestRows[0].id,
          type: "REFUND",
        },
      })) === 1
  );

  const cancelOrganizerEventForm = new FormData();
  cancelOrganizerEventForm.set("eventId", organizerEvent.id);
  cancelOrganizerEventForm.set("reason", "Organizer event cancellation check.");
  cancelOrganizerEventForm.set("refund", "none");
  const organizerEventCancelled = await cancelEventAction(
    {},
    cancelOrganizerEventForm
  );
  const organizerEventAfterCancellation = await getOwnerEventDetails(
    organizerEvent.publicId,
    partner.id
  );
  ok(
    "event cancellation reverses every remaining organizer-player fee",
    Boolean(organizerEventCancelled.success) &&
      organizerEventAfterCancellation?.finance.platformFees === 0 &&
      (await prisma.serviceFeeEntry.count({
        where: {
          eventOrganizerGuestId: { in: organizerGuestRows.map((guest) => guest.id) },
          type: "REFUND",
          amount: -15,
        },
      })) === 2
  );

  const deleteOrganizerEventForm = new FormData();
  deleteOrganizerEventForm.set("eventId", organizerEvent.id);
  const deleteOrganizerEvent = await deleteCancelledEventAction(
    {},
    deleteOrganizerEventForm
  );
  ok(
    "cancelled events with organizer-player fee history remain auditable",
    deleteOrganizerEvent.message?.includes("financial history") === true &&
      (await prisma.event.count({ where: { id: organizerEvent.id } })) === 1
  );

  const freeOrganizerEvent = await prisma.event.create({
    data: {
      publicId: `check-free-organizer-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Free organizer player check",
      sport: "pickleball",
      date: DATE,
      startHour: 15,
      endHour: 16,
      startsAt: manilaInstant(DATE, 15),
      endsAt: manilaInstant(DATE, 16),
      capacity: 2,
      registrationFee: 0,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  const freeOrganizerPlayerForm = new FormData();
  freeOrganizerPlayerForm.set("eventId", freeOrganizerEvent.id);
  freeOrganizerPlayerForm.append("guestName", "Free Organizer Player");
  const freeOrganizerPlayer = await addOrganizerEventGuestsAction(
    {},
    freeOrganizerPlayerForm
  );
  const freeOrganizerGuest = await prisma.eventOrganizerGuest.findFirstOrThrow({
    where: { eventId: freeOrganizerEvent.id },
    select: { id: true },
  });
  ok(
    "free events add complimentary players without zero-value ledger entries",
    Boolean(freeOrganizerPlayer.success) &&
      (await prisma.serviceFeeEntry.count({
        where: { eventOrganizerGuestId: freeOrganizerGuest.id },
      })) === 0
  );

  const overduePayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: gateway.id,
      userId: players[2].id,
      hubId: hub.id,
      amount: 103,
      venueAmount: 100,
      platformFee: 3,
      method: "CARD",
      status: "SUCCEEDED",
      provider: "paymongo",
      expiresAt: new Date("2099-12-12T00:00:00Z"),
      paidAt: new Date("2020-01-01T00:00:00Z"),
    },
    select: { id: true },
  });
  await prisma.serviceFeeEntry.create({
    data: {
      partnerId: partner.id,
      bookingPaymentId: overduePayment.id,
      type: "CHARGE",
      amount: 3,
      createdAt: new Date("2020-01-01T00:00:00Z"),
    },
  });
  const blockedOrganizerEvent = await prisma.event.create({
    data: {
      publicId: `check-blocked-organizer-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Blocked organizer player check",
      sport: "pickleball",
      date: DATE,
      startHour: 16,
      endHour: 17,
      startsAt: manilaInstant(DATE, 16),
      endsAt: manilaInstant(DATE, 17),
      capacity: 2,
      registrationFee: 100,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true },
  });
  const blockedOrganizerPlayerForm = new FormData();
  blockedOrganizerPlayerForm.set("eventId", blockedOrganizerEvent.id);
  blockedOrganizerPlayerForm.append("guestName", "Blocked Organizer Player");
  const blockedOrganizerPlayer = await addOrganizerEventGuestsAction(
    {},
    blockedOrganizerPlayerForm
  );
  ok(
    "an overdue service-fee balance blocks organizer-added event players",
    blockedOrganizerPlayer.message?.includes("overdue") === true &&
      (await prisma.eventOrganizerGuest.count({
        where: { eventId: blockedOrganizerEvent.id },
      })) === 0
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
    paidDelete.message?.includes("financial history") === true &&
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
