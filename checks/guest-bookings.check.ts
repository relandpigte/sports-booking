// Guest court checkout keeps an independent identity, private access, and the
// same partner-facing booking record without creating a shadow account.
//
//   npm run check:guest-bookings
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { newGuestAccessToken } from "@/lib/guest-bookings";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-guest-booking-partner@example.test";
const PLAYER_EMAIL = "check-guest-booking-player@example.com";

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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        partnerStatus: true,
      },
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
  const manualBooking = await prisma.booking.create({
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
    select: { id: true },
  });
  await prisma.bookingSlot.create({
    data: {
      bookingId: manualBooking.id,
      courtId: hub.courts[0].id,
      date: "2035-01-01",
      hour: 9,
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

  await prisma.bookingPayment.update({
    where: { id: payment.id },
    data: {
      manualReceiptImage: null,
      manualSubmittedAt: null,
    },
  });
  const { getActiveBookingHoldForGuest } = await import(
    "@/lib/booking-payments"
  );
  const guestHold = await getActiveBookingHoldForGuest({
    guestReservationId: guest.id,
  });
  ok(
    "a live guest checkout can restore its reservation dock across public pages",
    guestHold?.paymentId === payment.id &&
      guestHold.venueName === "Guest Checkout Hub" &&
      guestHold.amount === 463.5 &&
      guestHold.lines[0]?.courtName === "Guest Court"
  );

  await prisma.bookingPayment.update({
    where: { id: payment.id },
    data: {
      manualReceiptImage: "data:image/png;base64,check",
      manualSubmittedAt: new Date("2035-01-01T00:05:00.000Z"),
    },
  });

  const originalApiKey = process.env.RESEND_API_KEY;
  const originalEmailFrom = process.env.EMAIL_FROM;
  const originalFetch = globalThis.fetch;
  const emailRequests: Array<{
    body: Record<string, unknown>;
    headers: Headers;
  }> = [];
  process.env.RESEND_API_KEY = "re_guest_confirmation_check_only";
  process.env.EMAIL_FROM = "Bunal.club <check@example.test>";
  globalThis.fetch = (async (_input, init) => {
    emailRequests.push({
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      headers: new Headers(init?.headers),
    });
    return new Response(JSON.stringify({ id: `guest-${emailRequests.length}` }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const { reviewManualPaymentAction } = await import(
      "@/lib/manual-payment-actions"
    );
    const approval = new FormData();
    approval.set("paymentId", payment.id);
    approval.set("decision", "approve");
    const approvalResult = await reviewManualPaymentAction({}, approval);
    const manualConfirmation = emailRequests[0];
    ok(
      "partner approval emails a guest player with a private confirmed-booking link",
      approvalResult.success ===
        "Payment approved and the booking was confirmed." &&
        String(manualConfirmation?.body.to).includes(PLAYER_EMAIL) &&
        String(manualConfirmation?.body.html).includes(
          "approved your manual payment"
        ) &&
        String(manualConfirmation?.body.html).includes("/bookings/access/") &&
        manualConfirmation?.headers.get("Idempotency-Key") ===
          `player-manual-booking-confirmed-${payment.id}`
    );

    const retryResult = await reviewManualPaymentAction({}, approval);
    const manualRetry = emailRequests[1];
    ok(
      "an already-approved manual payment can retry the same idempotent confirmation",
      retryResult.success ===
        "Payment was already approved. The confirmation email was checked." &&
        manualRetry?.headers.get("Idempotency-Key") ===
          manualConfirmation?.headers.get("Idempotency-Key")
    );

    const automaticGuest = await prisma.guestReservation.create({
      data: {
        name: "Automatic Guest Checkout",
        phone: "+639171113333",
        email: PLAYER_EMAIL,
        accessExpiresAt,
      },
      select: { id: true },
    });
    const automaticPayment = await prisma.bookingPayment.create({
      data: {
        partnerId: partner.id,
        guestReservationId: automaticGuest.id,
        hubId: hub.id,
        amount: 463.5,
        venueAmount: 450,
        platformFee: 13.5,
        processingFee: 15,
        method: "QRPH",
        collectionMode: "AUTOMATIC",
        status: "SUCCEEDED",
        provider: "paymongo",
        providerPaymentId: "pi_guest_confirmation_check",
        paidAt: new Date(),
        expiresAt: accessExpiresAt,
      },
      select: { id: true },
    });
    const automaticBooking = await prisma.booking.create({
      data: {
        hubId: hub.id,
        courtId: hub.courts[0].id,
        guestReservationId: automaticGuest.id,
        bookingPaymentId: automaticPayment.id,
        date: "2035-01-02",
        startHour: 11,
        endHour: 12,
        hours: 1,
        startsAt: new Date("2035-01-02T03:00:00.000Z"),
        endsAt: new Date("2035-01-02T04:00:00.000Z"),
        hourlyRate: 450,
        totalPrice: 450,
        status: "PENDING",
        holdExpiresAt: accessExpiresAt,
      },
      select: { id: true },
    });
    await prisma.bookingSlot.create({
      data: {
        bookingId: automaticBooking.id,
        courtId: hub.courts[0].id,
        date: "2035-01-02",
        hour: 11,
        holdExpiresAt: accessExpiresAt,
      },
    });

    const { settleBookingPayment } = await import("@/lib/booking-payments");
    const automaticSettlement = await settleBookingPayment(
      automaticPayment.id
    );
    const automaticConfirmation = emailRequests[2];
    ok(
      "automatic PayMongo settlement emails a guest player with a private confirmed-booking link",
      automaticSettlement.status === "confirmed" &&
        automaticSettlement.confirmationEmail === "sent" &&
        String(automaticConfirmation?.body.to).includes(PLAYER_EMAIL) &&
        String(automaticConfirmation?.body.html).includes(
          "payment was successful"
        ) &&
        String(automaticConfirmation?.body.html).includes(
          "/bookings/access/"
        ) &&
        automaticConfirmation?.headers.get("Idempotency-Key") ===
          `player-automatic-booking-confirmed-${automaticPayment.id}`
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalEmailFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = originalEmailFrom;
  }

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
