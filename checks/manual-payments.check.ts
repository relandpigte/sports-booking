// Fee-free manual collection: frozen review holds, event capacity, approval
// settlement, and venue-only external-refund recording.
//
//   npm run check:manual-payments
import { PrismaClient } from "@prisma/client";

import { ok, run, stubRequestContext } from "./harness";
import {
  isPartnerPaymentReady,
  type PartnerPaymentSetup,
} from "@/lib/manual-payments";
import { manilaInstant } from "@/lib/time";

const prisma = new PrismaClient();
const PARTNER_EMAIL = "check-manual-payments-partner@example.test";
const PLAYER_EMAIL = "check-manual-payments-player@example.test";
const DATE = "2099-10-15";
const VALID_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=";

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { in: [PARTNER_EMAIL, PLAYER_EMAIL] } },
  });
}

async function check() {
  const setup = (
    values: Partial<PartnerPaymentSetup>
  ): PartnerPaymentSetup => ({
    mode: "AUTOMATIC",
    automaticReady: false,
    manualReady: false,
    gateway: null,
    ...values,
  });
  ok(
    "manual checkout is ready with an active payment channel",
    isPartnerPaymentReady(setup({ mode: "MANUAL", manualReady: true }))
  );
  ok(
    "manual checkout ignores an inactive automatic configuration",
    !isPartnerPaymentReady(
      setup({
        mode: "MANUAL",
        automaticReady: true,
        manualReady: false,
        gateway: { id: "gateway", provider: "paymongo" },
      })
    )
  );
  ok(
    "automatic checkout is ready with a connected gateway",
    isPartnerPaymentReady(
      setup({
        automaticReady: true,
        gateway: { id: "gateway", provider: "paymongo" },
      })
    )
  );
  ok(
    "automatic checkout ignores an inactive manual configuration",
    !isPartnerPaymentReady(
      setup({ mode: "AUTOMATIC", automaticReady: false, manualReady: true })
    )
  );

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
      name: true,
      partnerStatus: true,
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
  const optionalReferenceProof = new FormData();
  optionalReferenceProof.set("paymentId", "missing-manual-payment");
  optionalReferenceProof.set("methodId", partner.manualPaymentMethods[0].id);
  optionalReferenceProof.set("receiptImage", VALID_PNG_DATA_URL);
  const optionalReferenceResult = await submitManualPaymentProofAction(
    {},
    optionalReferenceProof
  );
  ok(
    "manual proof accepts the transaction reference as optional",
    optionalReferenceResult.message === "Payment not found." &&
      !optionalReferenceResult.errors?.paymentReference
  );

  const proof = new FormData();
  proof.set("paymentId", courtPayment.id);
  proof.set("methodId", partner.manualPaymentMethods[0].id);
  proof.set("receiptImage", VALID_PNG_DATA_URL);
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
      frozen.manualPaymentRef === "MANUAL-PROOF-CHECK" &&
      frozen.manualMethodLabel === "Venue GCash" &&
      frozen.bookings.every((booking) => booking.holdExpiresAt == null)
  );

  const secondPayment = await prisma.bookingPayment.create({
    data: {
      partnerId: partner.id,
      userId: player.id,
      hubId: hub.id,
      amount: 100,
      venueAmount: 100,
      platformFee: 0,
      processingFee: 0,
      method: "MANUAL",
      collectionMode: "MANUAL",
      status: "PENDING",
      provider: "manual",
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
    select: { id: true },
  });
  const secondProof = new FormData();
  secondProof.set("paymentId", secondPayment.id);
  secondProof.set("methodId", partner.manualPaymentMethods[0].id);
  secondProof.set("receiptImage", VALID_PNG_DATA_URL);
  secondProof.set("paymentReference", "second-manual-proof");
  const secondSubmission = await submitManualPaymentProofAction({}, secondProof);
  ok(
    "a player cannot hold multiple manual proofs at the same venue",
    secondSubmission.code === "MANUAL_PAYMENT_PENDING_LIMIT" &&
      (await prisma.bookingPayment.count({
        where: { id: secondPayment.id, manualSubmittedAt: null },
      })) === 1
  );

  const { expireBookingHolds, markBookingPaymentRefunded, settleBookingPayment } =
    await import("@/lib/booking-payments");
  await expireBookingHolds(new Date(holdExpiresAt.getTime() + 60_000));
  const preservedManualPayment = await prisma.bookingPayment.findUnique({
    where: { id: courtPayment.id },
    select: { status: true, manualSubmittedAt: true },
  });
  ok(
    "a submitted manual receipt is excluded from the expiry sweep",
    preservedManualPayment?.status === "PENDING" &&
      preservedManualPayment.manualSubmittedAt != null &&
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
    "manual approval charges only the advertised amount and accrues no service fee",
    (await prisma.bookingPayment.count({
      where: {
        id: courtPayment.id,
        gatewayId: null,
        amount: 500,
        venueAmount: 500,
        platformFee: 0,
        processingFee: 0,
      },
    })) === 1 &&
      (await prisma.serviceFeeEntry.count({
        where: {
          bookingPaymentId: courtPayment.id,
        },
      })) === 0
  );

  const duplicateProof = new FormData();
  duplicateProof.set("paymentId", secondPayment.id);
  duplicateProof.set("methodId", partner.manualPaymentMethods[0].id);
  duplicateProof.set("receiptImage", VALID_PNG_DATA_URL);
  duplicateProof.set("paymentReference", "manual-proof-check");
  const duplicateSubmission = await submitManualPaymentProofAction(
    {},
    duplicateProof
  );
  ok(
    "a venue cannot receive the same manual transfer reference twice",
    duplicateSubmission.code === "DUPLICATE_PAYMENT_REFERENCE" &&
      (await prisma.bookingPayment.count({
        where: { id: secondPayment.id, manualSubmittedAt: null },
      })) === 1
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
  const eventHoldExpiresAt = new Date(Date.now() + 15 * 60_000);
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
      expiresAt: eventHoldExpiresAt,
      eventRegistration: {
        create: {
          eventId: event.id,
          userId: player.id,
          status: "PENDING",
          holdExpiresAt: eventHoldExpiresAt,
          guests: {
            create: ["Guest One", "Guest Two"].map((name) => ({
              name,
              status: "PENDING" as const,
              holdExpiresAt: eventHoldExpiresAt,
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
  const eventProof = new FormData();
  eventProof.set("paymentId", eventPayment.id);
  eventProof.set("methodId", partner.manualPaymentMethods[0].id);
  eventProof.set("receiptImage", VALID_PNG_DATA_URL);
  eventProof.set("paymentReference", "event-manual-proof");
  const eventSubmission = await submitManualPaymentProofAction({}, eventProof);
  const frozenEvent = await prisma.eventRegistration.findUnique({
    where: { bookingPaymentId: eventPayment.id },
    select: {
      holdExpiresAt: true,
      guests: { select: { holdExpiresAt: true } },
    },
  });
  ok(
    "manual event proof freezes the lead and guest capacity in one claim",
    Boolean(eventSubmission.success) &&
      frozenEvent != null &&
      frozenEvent.holdExpiresAt == null &&
      frozenEvent.guests.every((guest) => guest.holdExpiresAt == null)
  );
  const { getPublicEvent } = await import("@/lib/events");
  const publicEvent = await getPublicEvent(event.publicId, player.id);
  ok(
    "a submitted three-person manual group continues occupying three event spots",
    publicEvent?.pendingCount === 3 &&
      publicEvent.remainingSpots === 0
  );
  ok(
    "the event page exposes a submitted manual registration as awaiting review",
    publicEvent?.viewerRegistration?.paymentReviewPending === true
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
  ok(
    "a three-person manual event accrues no service-fee charge",
    (await prisma.serviceFeeEntry.count({
      where: {
        bookingPaymentId: eventPayment.id,
      },
    })) === 0
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
    "manual refund returns the complete fee-free checkout amount",
    refunded?.status === "REFUNDED" &&
      Number(refunded.refundedAmount) === 300 &&
      refunded.refundRef === "manual-refund-check" &&
      (await prisma.serviceFeeEntry.count({
        where: {
          bookingPaymentId: eventPayment.id,
        },
      })) === 0
  );

  const { getPublicHub } = await import("@/lib/hubs");
  const readyHub = await getPublicHub(hub.id);
  ok(
    "an approved hub with Manual selected and an active channel is bookable",
    readyHub?.bookable === true &&
      readyHub.comingSoon === false &&
      readyHub.blockedBy === null &&
      readyHub.paymentMode === "MANUAL"
  );

  const fallbackMethod = await prisma.partnerManualPaymentMethod.create({
    data: {
      partnerId: partner.id,
      network: "MAYA",
      label: "Venue Maya",
      accountIdentifier: "09180000000",
      active: true,
      sortOrder: 1,
    },
  });
  // The action module was loaded above with this mutable request-context
  // actor. Switch that same actor to the venue owner before exercising the
  // authenticated settings action.
  Object.assign(player, partner);
  stubRequestContext(partner);
  const { deleteManualPaymentMethodAction } = await import(
    "@/lib/manual-payment-actions"
  );
  const deleteMethodData = new FormData();
  deleteMethodData.set("id", partner.manualPaymentMethods[0].id);
  const deleteMethodResult = await deleteManualPaymentMethodAction(
    {},
    deleteMethodData
  );
  const historicalPayment = await prisma.bookingPayment.findUnique({
    where: { id: courtPayment.id },
    select: {
      manualPaymentMethodId: true,
      manualMethodLabel: true,
      manualAccountDetails: true,
    },
  });
  ok(
    "a partner can delete a manual destination when another one is enabled",
    Boolean(deleteMethodResult.success) &&
      (await prisma.partnerManualPaymentMethod.findUnique({
        where: { id: partner.manualPaymentMethods[0].id },
      })) === null
  );
  ok(
    "deleting a partner destination preserves historical payment snapshots",
    historicalPayment?.manualPaymentMethodId === null &&
      historicalPayment.manualMethodLabel === "Venue GCash" &&
      historicalPayment.manualAccountDetails === "09170000000"
  );
  const deleteFinalMethodData = new FormData();
  deleteFinalMethodData.set("id", fallbackMethod.id);
  const deleteFinalMethodResult = await deleteManualPaymentMethodAction(
    {},
    deleteFinalMethodData
  );
  ok(
    "manual checkout prevents deleting its final active partner destination",
    Boolean(deleteFinalMethodResult.message) &&
      (await prisma.partnerManualPaymentMethod.findUnique({
        where: { id: fallbackMethod.id },
      })) !== null
  );
}

void run(check, async () => {
  await cleanup();
  await prisma.$disconnect();
});
