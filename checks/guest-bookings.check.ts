// Guest court checkout keeps an independent identity, private access, and the
// same partner-facing booking record without creating a shadow account.
//
//   npm run check:guest-bookings
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { newGuestAccessToken } from "@/lib/guest-bookings";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-guest-booking-partner@example.test";
const PLAYER_EMAIL = "check-guest-booking-player@example.test";

async function cleanup() {
  await prisma.guestReservation.deleteMany({
    where: { email: PLAYER_EMAIL },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, PLAYER_EMAIL] } },
  });
}

async function check() {
  await cleanup();
  const [partner, existingPlayer] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Guest booking partner",
        email: PARTNER_EMAIL,
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
      select: { id: true, email: true },
    }),
    prisma.user.create({
      data: {
        name: "Existing account",
        email: PLAYER_EMAIL,
        role: "PLAYER",
      },
      select: { id: true },
    }),
  ]);
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Guest Checkout Hub",
      coverPhotos: [],
      games: ["pickleball"],
      courts: { create: { name: "Guest Court", hourlyRate: 450 } },
    },
    select: { id: true, courts: { select: { id: true } } },
  });
  const accessExpiresAt = new Date("2035-01-03T00:00:00.000Z");
  const access = newGuestAccessToken();
  const guest = await prisma.guestReservation.create({
    data: {
      name: "Guest Checkout",
      phone: "+639171112222",
      // Matching an existing account must not silently attach the booking.
      email: PLAYER_EMAIL,
      accessExpiresAt,
      accessTokens: {
        create: {
          tokenHash: access.hash,
          expiresAt: accessExpiresAt,
        },
      },
    },
    select: { id: true },
  });
  const payment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      guestReservationId: guest.id,
      hubId: hub.id,
      amount: 463.5,
      venueAmount: 450,
      platformFee: 13.5,
      processingFee: 0,
      method: "MANUAL",
      collectionMode: "MANUAL",
      status: "PENDING",
      provider: "manual",
      expiresAt: accessExpiresAt,
      manualMethodLabel: "GCash",
      manualReceiptImage: "data:image/png;base64,check",
      manualSubmittedAt: new Date("2035-01-01T00:05:00.000Z"),
    },
    select: { id: true },
  });
  await prisma.booking.create({
    data: {
      hubId: hub.id,
      courtId: hub.courts[0].id,
      guestReservationId: guest.id,
      bookingPaymentId: payment.id,
      date: "2035-01-01",
      startHour: 9,
      endHour: 10,
      hours: 1,
      startsAt: new Date("2035-01-01T01:00:00.000Z"),
      endsAt: new Date("2035-01-01T02:00:00.000Z"),
      hourlyRate: 450,
      totalPrice: 450,
      status: "PENDING",
      holdExpiresAt: accessExpiresAt,
    },
  });

  const storedAccess = await prisma.guestReservationAccessToken.findUnique({
    where: { tokenHash: access.hash },
    select: { tokenHash: true },
  });
  ok(
    "email access is stored as a hash instead of a reusable raw secret",
    storedAccess?.tokenHash === access.hash && access.raw !== access.hash
  );

  stubRequestContext(partner);
  const { listPartnerBookings } = await import("@/lib/bookings");
  const result = await listPartnerBookings(
    {
      section: "upcoming",
      sort: "soonest",
      query: "Guest Checkout",
      page: 1,
    },
    partner.id
  );
  ok(
    "venue owners can find guest contact details in the normal booking inbox",
    result.total === 1 &&
      result.items[0]?.player.guest === true &&
      result.items[0]?.player.name === "Guest Checkout" &&
      result.items[0]?.player.phone === "+639171112222" &&
      result.items[0]?.player.email === PLAYER_EMAIL
  );
  ok(
    "an existing email remains an independent guest reservation",
    result.items[0]?.player.id === `guest:${guest.id}` &&
      result.items[0]?.player.id !== existingPlayer.id
  );

  let rejectedDualOwner = false;
  try {
    await prisma.booking.create({
      data: {
        hubId: hub.id,
        courtId: hub.courts[0].id,
        userId: existingPlayer.id,
        guestReservationId: guest.id,
        date: "2035-01-02",
        startHour: 9,
        endHour: 10,
        hours: 1,
        startsAt: new Date("2035-01-02T01:00:00.000Z"),
        endsAt: new Date("2035-01-02T02:00:00.000Z"),
        status: "CONFIRMED",
      },
    });
  } catch {
    rejectedDualOwner = true;
  }
  ok(
    "the database rejects a booking owned by both an account and a guest",
    rejectedDualOwner
  );

  let rejectedOwnerlessPayment = false;
  try {
    await prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        hubId: hub.id,
        amount: 100,
        method: "MANUAL",
        collectionMode: "MANUAL",
        provider: "manual",
        expiresAt: accessExpiresAt,
      },
    });
  } catch {
    rejectedOwnerlessPayment = true;
  }
  ok(
    "the database rejects a payment without an account or guest owner",
    rejectedOwnerlessPayment
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
