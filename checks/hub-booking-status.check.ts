// Partner-controlled hub status must block every fresh booking path.
//
//   npm run check:hub-status
import crypto from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { type OperatingHours, WEEKDAYS } from "@/lib/constants";
import { addDays, manilaInstant, manilaToday } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-hub-status-partner@example.test";
const PLAYER_EMAIL = "check-hub-status-player@example.test";

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
  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "Hub status check partner",
      email: PARTNER_EMAIL,
      passwordHash: "x",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
    },
    select: { id: true },
  });
  const player = await prisma.user.create({
    data: {
      name: "Hub status check player",
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
      publicKey: "pk_test_hub_status",
      secretKeyEnc: "check",
      webhookSecretEnc: "check",
      secretKeyHint: "…test",
      webhookToken: crypto.randomBytes(24).toString("base64url"),
    },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Hub Status Check",
      slug: `hub-status-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
      operatingHours,
      bookingStatus: "MAINTENANCE",
      bookingStatusMessage: "The courts are being resurfaced.",
      courts: {
        create: {
          name: "Status Court",
          courtType: "covered",
          hourlyRate: 500,
        },
      },
    },
    select: {
      id: true,
      slug: true,
      courts: { select: { id: true } },
    },
  });
  const date = addDays(manilaToday(), 7);
  const event = await prisma.event.create({
    data: {
      publicId: `hub-status-${crypto.randomBytes(8).toString("hex")}`,
      hubId: hub.id,
      title: "Paused Hub Open Play",
      sport: "pickleball",
      date,
      startHour: 18,
      endHour: 20,
      startsAt: manilaInstant(date, 18),
      endsAt: manilaInstant(date, 20),
      capacity: 8,
      registrationFee: 0,
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    select: { id: true, publicId: true },
  });

  // Both action modules capture the same player viewer for this entire check.
  // Keeping actor-specific action checks in separate processes prevents the
  // CommonJS module cache from leaking a prior check actor between imports.
  stubRequestContext(player);
  const [{ createBookingAction }, { registerForEventAction }] =
    await Promise.all([
      import("@/lib/booking-actions"),
      import("@/lib/event-actions"),
    ]);

  const bookingForm = new FormData();
  bookingForm.set("date", date);
  bookingForm.append("courtIds", hub.courts[0].id);
  bookingForm.append("hours", "10");
  const booking = await createBookingAction({}, bookingForm);
  ok(
    "maintenance mode rejects a fresh court booking server-side",
    booking.message?.includes("isn't taking online bookings") === true ||
      booking.message?.includes("paused new bookings") === true
  );
  ok(
    "a rejected court booking creates neither a booking nor a slot",
    (await prisma.booking.count({ where: { hubId: hub.id } })) === 0 &&
      (await prisma.bookingSlot.count({
        where: { courtId: hub.courts[0].id },
      })) === 0
  );

  const registrationForm = new FormData();
  registrationForm.set("publicId", event.publicId);
  const registration = await registerForEventAction({}, registrationForm);
  ok(
    "maintenance mode rejects a fresh event registration server-side",
    registration.message?.includes("paused new event registrations") === true
  );
  ok(
    "a rejected event registration reserves no capacity",
    (await prisma.eventRegistration.count({
      where: { eventId: event.id },
    })) === 0
  );

  const [{ getPublicHub }, { getPublicEvent, listPublicEvents }] =
    await Promise.all([import("@/lib/hubs"), import("@/lib/events")]);
  const [publicHub, publicEvent, upcomingEvents] = await Promise.all([
    getPublicHub(hub.slug ?? hub.id),
    getPublicEvent(event.publicId),
    listPublicEvents("upcoming"),
  ]);
  ok(
    "maintenance mode publishes its banner while disabling hub bookings",
    publicHub?.bookable === false &&
      publicHub.comingSoon === false &&
      publicHub.blockedBy === "maintenance" &&
      publicHub.bookingStatusMessage === "The courts are being resurfaced."
  );
  ok(
    "paused events keep their public status but leave event discovery",
    publicEvent?.hub.bookingStatus === "MAINTENANCE" &&
      publicEvent.hub.bookingStatusMessage ===
        "The courts are being resurfaced." &&
      !upcomingEvents.some((item) => item.publicId === event.publicId)
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
