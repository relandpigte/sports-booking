// Manual collection: fee-free ledgers, frozen review holds, event capacity,
// approval settlement, and full external-refund recording.
//
//   npm run check:manual-payments
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import { manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-manual-payments-partner@example.test";
const PLAYER_EMAIL = "check-manual-payments-player@example.test";
const DATE = "2099-10-15";

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, PLAYER_EMAIL] } },
  });
}

async function check() {
  await cleanup();
  const partner = await prisma.user.create({
    data: {
      name: "Manual payments check partner",
      email: PARTNER_EMAIL,
      passwordHash: "x",
      role: "PARTNER",
      partnerStatus: "ACTIVE",
      partnerPaymentMode: "MANUAL",
      manualPaymentMethods: {
        create: {
          network: "GCASH",
          label: "Venue GCash",
          accountName: "Manual Check Venue",
          accountIdentifier: "09170000000",
        },
      },
    },
    select: {
      id: true,
      email: true,
      role: true,
      manualPaymentMethods: { select: { id: true } },
    },
  });
  const player = await prisma.user.create({
    data: {
      name: "Manual payments check player",
      email: PLAYER_EMAIL,
      passwordHash: "x",
      role: "PLAYER",
    },
    select: { id: true, email: true, role: true },
  });
  const hub = await prisma.hub.create({
    data: {
      ownerId: partner.id,
      name: "Manual Payments Check Hub",
      slug: `manual-payments-${partner.id}`,
      coverPhotos: [],
      games: ["pickleball"],
      courts: {
        create: { name: "Manual Court", courtType: "covered", hourlyRate: 500 },
      },
    },
    select: { id: true, courts: { select: { id: true } } },
  });
  const courtId = hub.courts[0].id;
  const holdExpiresAt = new Date(Date.now() + 15 * 60_000);
  const courtPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      gatewayId: null,
      userId: player.id,
      hubId: hub.id,
      amount: 500,
      venueAmount: 500,
      platformFee: 0,
      processingFee: 0,
      method: "MANUAL",
      collectionMode: "MANUAL",
      status: "PENDING",
      provider: "manual",
      expiresAt: holdExpiresAt,
      bookings: {
        create: {
          courtId,
          hubId: hub.id,
          userId: player.id,
          date: DATE,
          startHour: 9,
          endHour: 10,
          hours: 1,
          startsAt: manilaInstant(DATE, 9),
          endsAt: manilaInstant(DATE, 10),
          hourlyRate: 500,
          totalPrice: 500,
          status: "PENDING",
          holdExpiresAt,
          slots: { create: { courtId, date: DATE, hour: 9, holdExpiresAt } },
        },
      },
    },
    select: { id: true },
  });

  stubRequestContext(player);
  const { submitManualPaymentProofAction } = await import(
    "@/lib/manual-payment-actions"
  );
  const proof = new FormData();
  proof.set("paymentId", courtPayment.id);
  proof.set("methodId", partner.manualPaymentMethods[0].id);
  proof.set("receiptImage", "data:image/png;base64,YQ==");
  proof.set("paymentReference", "manual-proof-check");
  const submitted = await submitManualPaymentProofAction({}, proof);
  const frozen = await prisma.bookingPayment.findUnique({
    where: { id: courtPayment.id },
    select: {
      manualSubmittedAt: true,
      manualPaymentRef: true,
      manualMethodLabel: true,
      bookings: { select: { holdExpiresAt: true } },
    },
  });
  ok(
    "an on-time receipt submission snapshots the method and freezes the court hold",
    Boolean(submitted.success) &&
      frozen?.manualSubmittedAt != null &&
      frozen.manualPaymentRef === "manual-proof-check" &&
      frozen.manualMethodLabel === "Venue GCash" &&
      frozen.bookings.every((booking) => booking.holdExpiresAt == null)
  );

  const { expireBookingHolds, markBookingPaymentRefunded, settleBookingPayment } =
    await import("@/lib/booking-payments");
  const swept = await expireBookingHolds(
    new Date(holdExpiresAt.getTime() + 60_000)
  );
  ok(
    "a submitted manual receipt is excluded from the expiry sweep",
    swept.payments === 0 &&
      (await prisma.bookingSlot.count({ where: { booking: { bookingPaymentId: courtPayment.id } } })) === 1
  );
  await prisma.bookingPayment.update({
    where: { id: courtPayment.id },
    data: { status: "SUCCEEDED", paidAt: new Date(), manualReviewedAt: new Date() },
  });
  const courtSettlement = await settleBookingPayment(courtPayment.id);
  ok(
    "partner approval confirms a frozen manual court booking",
    courtSettlement.status === "confirmed" &&
      (await prisma.booking.count({ where: { bookingPaymentId: courtPayment.id, status: "CONFIRMED" } })) === 1
  );
  ok(
    "manual collection has no gateway, service fee, or processing fee",
    (await prisma.bookingPayment.count({
      where: {
        id: courtPayment.id,
        gatewayId: null,
        platformFee: 0,
        processingFee: 0,
      },
    })) === 1 &&
      (await prisma.serviceFeeEntry.count({ where: { bookingPaymentId: courtPayment.id } })) === 0
  );

  const event = await prisma.event.create({
    data: {
      publicId: `manual-event-${partner.id}`,
      hubId: hub.id,
      title: "Manual Open Play",
      sport: "pickleball",
      date: DATE,
      startHour: 12,
      endHour: 14,
      startsAt: manilaInstant(DATE, 12),
      endsAt: manilaInstant(DATE, 14),
      capacity: 3,
      registrationFee: 100,
      status: "PUBLISHED",
      publishedAt: new Date(),
      courts: { create: { courtId } },
    },
    select: { id: true, publicId: true },
  });
  const eventPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      userId: player.id,
      hubId: hub.id,
      amount: 300,
      venueAmount: 300,
      platformFee: 0,
      processingFee: 0,
      method: "GCASH",
      collectionMode: "MANUAL",
      status: "PENDING",
      provider: "manual",
      expiresAt: new Date(Date.now() - 60_000),
      manualSubmittedAt: new Date(),
      manualReceiptImage: "data:image/png;base64,YQ==",
      eventRegistration: {
        create: {
          eventId: event.id,
          userId: player.id,
          status: "PENDING",
          guests: {
            create: ["Guest One", "Guest Two"].map((name) => ({
              name,
              status: "PENDING" as const,
              holdExpiresAt: null,
            })),
          },
        },
      },
    },
    select: { id: true },
  });
  await prisma.eventGuestSlot.updateMany({
    where: { registration: { bookingPaymentId: eventPayment.id } },
    data: { bookingPaymentId: eventPayment.id },
  });
  const { getPublicEvent } = await import("@/lib/events");
  const publicEvent = await getPublicEvent(event.publicId, player.id);
  ok(
    "a submitted three-person manual group continues occupying three event spots",
    publicEvent?.pendingCount === 3 && publicEvent.remainingSpots === 0
  );
  await prisma.bookingPayment.update({
    where: { id: eventPayment.id },
    data: { status: "SUCCEEDED", paidAt: new Date(), manualReviewedAt: new Date() },
  });
  const eventSettlement = await settleBookingPayment(eventPayment.id);
  ok(
    "one approval confirms the lead player and both named guests",
    eventSettlement.status === "confirmed" &&
      (await prisma.eventRegistration.count({ where: { bookingPaymentId: eventPayment.id, status: "CONFIRMED" } })) === 1 &&
      (await prisma.eventGuestSlot.count({ where: { bookingPaymentId: eventPayment.id, status: "CONFIRMED" } })) === 2
  );

  await markBookingPaymentRefunded({
    paymentId: eventPayment.id,
    amount: 300,
    refundRef: "manual-refund-check",
    reason: "External refund check",
    refundedById: partner.id,
  });
  const refunded = await prisma.bookingPayment.findUnique({
    where: { id: eventPayment.id },
    select: { status: true, refundedAmount: true, refundRef: true },
  });
  ok(
    "manual refund recording stores the full venue amount and reference",
    refunded?.status === "REFUNDED" &&
      Number(refunded.refundedAmount) === 300 &&
      refunded.refundRef === "manual-refund-check"
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
