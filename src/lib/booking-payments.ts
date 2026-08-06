import "server-only";

import {
  Prisma,
  type EventRegistrationStatus,
  type PaymentCollectionMode,
  type PaymentMethodType,
  type PaymentStatus,
} from "@prisma/client";

import {
  BOOKING_HOLD_MINUTES,
  PAYMENT_COMPLETION_GRACE_MINUTES,
  paymongoQrPhProcessingFeeFor,
} from "@/lib/constants";
import { prisma } from "@/lib/db";
import {
  loadGatewayCredentials,
  loadGatewayCredentialsForCharge,
} from "@/lib/partner-gateway";
import { getVenueGateway, UnknownVenueGateway } from "@/lib/payments/venue";
import type { ChargeResult } from "@/lib/payments/types";
import { formatManilaDate, formatSlotRange } from "@/lib/time";
import { ensureServiceFeeCharge } from "@/lib/service-fees";
import {
  getActiveManualPaymentMethods,
  type ManualPaymentMethodView,
} from "@/lib/manual-payments";

// Players paying venues through each partner's own gateway.
//
// The rule this whole file is built around: a BookingPayment stays PENDING for
// as long as its hold is alive, however many QR Ph attempts fail against it.
// PENDING means "the hours are still yours and no money has moved"; SUCCEEDED
// means the money moved; FAILED is terminal and only ever set once the hold is
// dead. That's what lets a player retry a failed checkout without us creating a
// second payment row — and without the court being released underneath them.

// ---------------------------------------------------------------------------
// Views (Decimal isn't RSC-serializable, so it stops here.)
// ---------------------------------------------------------------------------

export type BookingPaymentLine = {
  bookingId: string;
  courtName: string;
  date: string;
  startHour: number;
  endHour: number;
  hours: number;
};

export type BookingPaymentView = {
  id: string;
  status: PaymentStatus;
  method: PaymentMethodType;
  collectionMode: PaymentCollectionMode;
  // Booking subtotal: venueAmount + platformFee.
  amount: number;
  venueAmount: number;
  platformFee: number;
  processingFee: number;
  payableAmount: number;
  currency: string;
  expiresAt: Date;
  // How long the hold has left, read from the clock HERE rather than in the
  // page: reading it during render is impure, and the countdown needs a
  // server-computed first value anyway.
  secondsLeft: number;
  attempt: number;
  // True while a charge is in flight. The UI uses it to keep the pay button
  // from firing a second one; the DB guard below is what actually enforces it.
  chargeInFlight: boolean;
  redirectUrl: string | null;
  qrImageUrl: string | null;
  providerPaymentId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  refundedAmount: number | null;
  refundReason: string | null;
  manualReceiptImage: string | null;
  manualMethodLabel: string | null;
  manualPaymentRef: string | null;
  manualSubmittedAt: Date | null;
  manualReviewedAt: Date | null;
  manualReviewNote: string | null;
  hubId: string;
  lines: BookingPaymentLine[];
  event: {
    registrationId: string;
    registrationStatus: EventRegistrationStatus;
    guestNames: string[];
    spotCount: number;
    addOn: boolean;
    publicId: string;
    title: string;
    date: string;
    startHour: number;
    endHour: number;
  } | null;
};

const paymentSelect = {
  id: true,
  status: true,
  method: true,
  collectionMode: true,
  provider: true,
  amount: true,
  venueAmount: true,
  platformFee: true,
  processingFee: true,
  currency: true,
  expiresAt: true,
  attempt: true,
  chargeStartedAt: true,
  redirectUrl: true,
  qrImageUrl: true,
  providerPaymentId: true,
  failureCode: true,
  failureMessage: true,
  paidAt: true,
  refundedAt: true,
  refundedAmount: true,
  refundReason: true,
  manualReceiptImage: true,
  manualMethodLabel: true,
  manualPaymentRef: true,
  manualSubmittedAt: true,
  manualReviewedAt: true,
  manualReviewNote: true,
  partnerId: true,
  hubId: true,
  bookings: {
    select: {
      id: true,
      date: true,
      startHour: true,
      endHour: true,
      hours: true,
      court: { select: { name: true } },
    },
    orderBy: { startsAt: "asc" },
  },
  eventRegistration: {
    select: {
      id: true,
      status: true,
      event: {
        select: {
          publicId: true,
          title: true,
          date: true,
          startHour: true,
          endHour: true,
        },
      },
    },
  },
  eventGuestSlots: {
    orderBy: { createdAt: "asc" as const },
    select: {
      name: true,
      status: true,
      holdExpiresAt: true,
      registration: {
        select: {
          id: true,
          status: true,
          event: {
            select: {
              publicId: true,
              title: true,
              date: true,
              startHour: true,
              endHour: true,
            },
          },
        },
      },
    },
  },
} as const;

type PaymentRow = Prisma.BookingPaymentGetPayload<{
  select: typeof paymentSelect;
}>;

export function mapBookingPayment(row: PaymentRow): BookingPaymentView {
  const guestRegistration = row.eventGuestSlots[0]?.registration;
  const eventRegistration = row.eventRegistration ?? guestRegistration;
  return {
    id: row.id,
    status: row.status,
    method: row.method,
    collectionMode: row.collectionMode,
    amount: Number(row.amount),
    venueAmount: Number(row.venueAmount),
    platformFee: Number(row.platformFee),
    processingFee: Number(row.processingFee),
    payableAmount: Number(row.amount) + Number(row.processingFee),
    currency: row.currency,
    expiresAt: row.expiresAt,
    secondsLeft: Math.max(
      0,
      Math.round((row.expiresAt.getTime() - Date.now()) / 1000)
    ),
    attempt: row.attempt,
    chargeInFlight: row.chargeStartedAt != null,
    redirectUrl: row.redirectUrl,
    qrImageUrl: row.qrImageUrl,
    providerPaymentId: row.providerPaymentId,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    paidAt: row.paidAt,
    refundedAt: row.refundedAt,
    refundedAmount: row.refundedAmount != null ? Number(row.refundedAmount) : null,
    refundReason: row.refundReason,
    manualReceiptImage: row.manualReceiptImage,
    manualMethodLabel: row.manualMethodLabel,
    manualPaymentRef: row.manualPaymentRef,
    manualSubmittedAt: row.manualSubmittedAt,
    manualReviewedAt: row.manualReviewedAt,
    manualReviewNote: row.manualReviewNote,
    hubId: row.hubId,
    lines: row.bookings.map((b) => ({
      bookingId: b.id,
      courtName: b.court.name,
      date: b.date,
      startHour: b.startHour,
      endHour: b.endHour,
      hours: b.hours,
    })),
    event: eventRegistration
      ? {
          registrationId: eventRegistration.id,
          registrationStatus: eventRegistration.status,
          guestNames: row.eventGuestSlots.map((guest) => guest.name),
          spotCount:
            row.eventGuestSlots.length + (row.eventRegistration ? 1 : 0),
          addOn: row.eventRegistration == null,
          ...eventRegistration.event,
        }
      : null,
  };
}

// Scoped to the player: the pay page is reachable by id, so ownership is in the
// where clause rather than an if-statement after the read.
export async function getBookingPaymentForPlayer(
  paymentId: string,
  userId: string
): Promise<BookingPaymentView | null> {
  const row = await prisma.bookingPayment.findFirst({
    where: { id: paymentId, userId },
    select: paymentSelect,
  });
  return row ? mapBookingPayment(row) : null;
}

// Everything the checkout page renders, in one read. The venue's name needs a
// second query because hubId is deliberately a scalar with no relation —
// deleting a hub must not cascade away a financial record.
export async function getBookingPaymentScreen(
  paymentId: string,
  userId: string
): Promise<{
  payment: BookingPaymentView;
  venueName: string;
  manualMethods: ManualPaymentMethodView[];
} | null> {
  const payment = await getBookingPaymentForPlayer(paymentId, userId);
  if (!payment) return null;

  const [hub, manualMethods] = await Promise.all([
    prisma.hub.findUnique({
      where: { id: payment.hubId },
      select: { name: true },
    }),
    payment.collectionMode === "MANUAL" && !payment.manualSubmittedAt
      ? prisma.bookingPayment
          .findUnique({ where: { id: payment.id }, select: { partnerId: true } })
          .then((row) =>
            row ? getActiveManualPaymentMethods(row.partnerId) : []
          )
      : Promise.resolve([]),
  ]);
  return { payment, venueName: hub?.name ?? "the venue", manualMethods };
}

export async function getBookingPaymentStatus(
  paymentId: string,
  userId: string
): Promise<{
  status: PaymentStatus;
  secondsLeft: number;
  chargeInFlight: boolean;
} | null> {
  const payment = await prisma.bookingPayment.findFirst({
    where: { id: paymentId, userId },
    select: {
      status: true,
      expiresAt: true,
      chargeStartedAt: true,
    },
  });
  if (!payment) return null;

  return {
    status: payment.status,
    secondsLeft: Math.max(
      0,
      Math.round((payment.expiresAt.getTime() - Date.now()) / 1000)
    ),
    chargeInFlight: payment.chargeStartedAt != null,
  };
}

// ---------------------------------------------------------------------------
// The ledger
// ---------------------------------------------------------------------------

// Writes a gateway outcome onto the row. Never touches the bookings — settling
// is a separate step, because it can fail for a reason the charge knows nothing
// about (the hold lapsing).
//
// Note the failed branch: it does NOT set status FAILED. See the file header.
export async function recordBookingChargeResult(
  paymentId: string,
  result: ChargeResult
): Promise<void> {
  const raw = result.raw as Prisma.InputJsonValue;

  if (result.status === "succeeded") {
    await prisma.bookingPayment.update({
      where: { id: paymentId },
      data: {
        status: "SUCCEEDED",
        providerPaymentId: result.paymentId,
        providerRef: result.reference,
        paidAt: new Date(),
        failureCode: null,
        failureMessage: null,
        redirectUrl: null,
        qrImageUrl: null,
        raw,
      },
    });
    return;
  }

  if (result.status === "requires_action") {
    // The charge is still in flight, so the claim deliberately stays set: the
    // player is off approving it and must not be able to start a second one.
    await prisma.bookingPayment.update({
      where: { id: paymentId },
      data: {
        status: "PENDING",
        providerPaymentId: result.paymentId,
        providerClientKey: result.clientKey,
        redirectUrl: result.redirectUrl,
        qrImageUrl: result.qrImageUrl,
        raw,
      },
    });
    return;
  }

  if (result.status === "pending") {
    await prisma.bookingPayment.update({
      where: { id: paymentId },
      data: {
        status: "PENDING",
        providerPaymentId: result.paymentId,
        providerRef: result.reference,
        raw,
      },
    });
    return;
  }

  // Declined. No money moved and the hold is still alive, so the row stays
  // PENDING and the claim is released — the player can retry QR Ph
  // against this same payment. Only expireBookingHolds writes FAILED.
  await prisma.bookingPayment.update({
    where: { id: paymentId },
    data: {
      status: "PENDING",
      providerPaymentId: result.paymentId,
      failureCode: result.code,
      failureMessage: result.message,
      chargeStartedAt: null,
      providerClientKey: null,
      redirectUrl: null,
      qrImageUrl: null,
      raw,
    },
  });
}

// ---------------------------------------------------------------------------
// Settling
// ---------------------------------------------------------------------------

// Thrown when the payment succeeded but the hours are gone. Caught inside
// settleBookingPayment; never escapes this file.
class LostHold extends Error {}

export type SettleOutcome =
  | { status: "confirmed"; bookingIds: string[]; registrationId?: string }
  | { status: "already" }
  | { status: "not-paid" }
  | { status: "missing" }
  // Paid, but the hold lapsed and the hours went to someone else. The bookings
  // are marked EXPIRED and the payment is refunded before this returns.
  | { status: "lost"; refunded: boolean };

// Confirms every booking this payment covers, atomically.
//
// Idempotent and safe to call from all three legs — the charge return, the
// webhook, and the return-leg poll — because it keys off the bookings that are
// still PENDING rather than off anything the caller knows.
export async function settleBookingPayment(
  paymentId: string
): Promise<SettleOutcome> {
  const payment = await prisma.bookingPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      userId: true,
      status: true,
      partnerId: true,
      platformFee: true,
      paidAt: true,
      collectionMode: true,
      manualSubmittedAt: true,
      bookings: { select: { id: true, status: true, hours: true } },
      eventRegistration: {
        select: {
          id: true,
          status: true,
          holdExpiresAt: true,
          event: {
            select: {
              id: true,
              status: true,
              startsAt: true,
            },
          },
        },
      },
      eventGuestSlots: {
        select: {
          id: true,
          status: true,
          holdExpiresAt: true,
          registration: {
            select: {
              id: true,
              status: true,
              event: {
                select: {
                  id: true,
                  status: true,
                  startsAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!payment) return { status: "missing" };
  if (payment.status === "REFUNDED") return { status: "already" };
  if (payment.status !== "SUCCEEDED") return { status: "not-paid" };

  if (payment.eventRegistration) {
    const registration = payment.eventRegistration;
    const pendingGuests = payment.eventGuestSlots.filter(
      (guest) => guest.status === "PENDING"
    );
    if (
      registration.status === "CONFIRMED" &&
      pendingGuests.length === 0
    ) {
      await prisma.$transaction((tx) => ensureServiceFeeCharge(tx, payment));
      return { status: "already" };
    }

    const manualUnderReview =
      payment.collectionMode === "MANUAL" && payment.manualSubmittedAt != null;
    const holdLive =
      (registration.status === "CONFIRMED" ||
        (registration.status === "PENDING" &&
          (manualUnderReview ||
            (registration.holdExpiresAt != null &&
              registration.holdExpiresAt > new Date())))) &&
      pendingGuests.every(
        (guest) =>
          manualUnderReview ||
          (guest.holdExpiresAt != null && guest.holdExpiresAt > new Date())
      ) &&
      registration.event.status === "PUBLISHED" &&
      (manualUnderReview || registration.event.startsAt > new Date());

    if (!holdLive) {
      await prisma.$transaction([
        prisma.eventRegistration.updateMany({
          where: { id: registration.id, status: "PENDING" },
          data: { status: "EXPIRED", holdExpiresAt: null },
        }),
        prisma.eventGuestSlot.updateMany({
          where: { bookingPaymentId: payment.id, status: "PENDING" },
          data: { status: "EXPIRED", holdExpiresAt: null },
        }),
      ]);
      const recovered = await recoverPaidEventRegistration({
        eventId: registration.event.id,
        userId: payment.userId,
      });
      if (recovered.status === "confirmed") {
        return {
          status: "confirmed",
          bookingIds: [],
          registrationId: recovered.registrationId,
        };
      }
      const refund = await refundBookingPayment({
        paymentId,
        reason:
          "The event registration hold expired or the event closed before payment completed.",
      });
      await recordAutomaticRefundFailure(paymentId, refund);
      return { status: "lost", refunded: refund.ok };
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${registration.event.id} FOR UPDATE`
        );
        if (registration.status === "PENDING") {
          const updated = await tx.eventRegistration.updateMany({
            where: {
              id: registration.id,
              status: "PENDING",
              ...(manualUnderReview
                ? {}
                : { holdExpiresAt: { gt: new Date() } }),
              event: {
                status: "PUBLISHED",
                ...(manualUnderReview ? {} : { startsAt: { gt: new Date() } }),
              },
            },
            data: {
              status: "CONFIRMED",
              holdExpiresAt: null,
              confirmedAt: new Date(),
            },
          });
          if (updated.count !== 1) throw new LostHold();
        }
        if (pendingGuests.length > 0) {
          const updatedGuests = await tx.eventGuestSlot.updateMany({
            where: {
              id: { in: pendingGuests.map((guest) => guest.id) },
              status: "PENDING",
              ...(manualUnderReview
                ? {}
                : { holdExpiresAt: { gt: new Date() } }),
            },
            data: {
              status: "CONFIRMED",
              holdExpiresAt: null,
              confirmedAt: new Date(),
            },
          });
          if (updatedGuests.count !== pendingGuests.length) throw new LostHold();
        }
        await ensureServiceFeeCharge(tx, payment);
      });
    } catch (error) {
      if (!(error instanceof LostHold)) throw error;
      await prisma.$transaction([
        prisma.eventRegistration.updateMany({
          where: { id: registration.id, status: "PENDING" },
          data: { status: "EXPIRED", holdExpiresAt: null },
        }),
        prisma.eventGuestSlot.updateMany({
          where: { bookingPaymentId: payment.id, status: "PENDING" },
          data: { status: "EXPIRED", holdExpiresAt: null },
        }),
      ]);
      const recovered = await recoverPaidEventRegistration({
        eventId: registration.event.id,
        userId: payment.userId,
      });
      if (recovered.status === "confirmed") {
        return {
          status: "confirmed",
          bookingIds: [],
          registrationId: recovered.registrationId,
        };
      }
      const refund = await refundBookingPayment({
        paymentId,
        reason: "The event registration hold expired before payment completed.",
      });
      await recordAutomaticRefundFailure(paymentId, refund);
      return { status: "lost", refunded: refund.ok };
    }

    return {
      status: "confirmed",
      bookingIds: [],
      registrationId: registration.id,
    };
  }

  if (payment.eventGuestSlots.length > 0) {
    const registration = payment.eventGuestSlots[0].registration;
    const pendingGuests = payment.eventGuestSlots.filter(
      (guest) => guest.status === "PENDING"
    );
    if (
      payment.eventGuestSlots.every(
        (guest) => guest.status === "CONFIRMED"
      )
    ) {
      await prisma.$transaction((tx) => ensureServiceFeeCharge(tx, payment));
      return { status: "already" };
    }

    const now = new Date();
    const manualUnderReview =
      payment.collectionMode === "MANUAL" && payment.manualSubmittedAt != null;
    const holdLive =
      pendingGuests.length > 0 &&
      registration.status === "CONFIRMED" &&
      registration.event.status === "PUBLISHED" &&
      (manualUnderReview || registration.event.startsAt > now) &&
      payment.eventGuestSlots.every(
        (guest) =>
          guest.status === "CONFIRMED" ||
          (guest.status === "PENDING" &&
            (manualUnderReview ||
              (guest.holdExpiresAt != null && guest.holdExpiresAt > now)))
      );

    if (holdLive) {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${registration.event.id} FOR UPDATE`
          );
          const updated = await tx.eventGuestSlot.updateMany({
            where: {
              id: { in: pendingGuests.map((guest) => guest.id) },
              status: "PENDING",
              ...(manualUnderReview
                ? {}
                : { holdExpiresAt: { gt: new Date() } }),
              registration: {
                status: "CONFIRMED",
                event: {
                  status: "PUBLISHED",
                  ...(manualUnderReview ? {} : { startsAt: { gt: new Date() } }),
                },
              },
            },
            data: {
              status: "CONFIRMED",
              holdExpiresAt: null,
              confirmedAt: new Date(),
            },
          });
          if (updated.count !== pendingGuests.length) throw new LostHold();
          await ensureServiceFeeCharge(tx, payment);
        });
        return {
          status: "confirmed",
          bookingIds: [],
          registrationId: registration.id,
        };
      } catch (error) {
        if (!(error instanceof LostHold)) throw error;
      }
    }

    await prisma.eventGuestSlot.updateMany({
      where: { bookingPaymentId: payment.id, status: "PENDING" },
      data: { status: "EXPIRED", holdExpiresAt: null },
    });
    const recovered = await recoverPaidEventGuestSlots(payment.id);
    if (recovered.status === "confirmed") {
      return {
        status: "confirmed",
        bookingIds: [],
        registrationId: recovered.registrationId,
      };
    }
    const refund = await refundBookingPayment({
      paymentId,
      reason:
        "The additional event spots expired or became unavailable before payment completed.",
    });
    await recordAutomaticRefundFailure(paymentId, refund);
    return { status: "lost", refunded: refund.ok };
  }

  const pending = payment.bookings.filter((b) => b.status === "PENDING");
  if (pending.length === 0) {
    // Repairs the narrow crash window where confirmation committed but fee
    // accrual did not. The unique ledger key keeps this retry idempotent.
    await prisma.$transaction((tx) => ensureServiceFeeCharge(tx, payment));
    return { status: "already" };
  }

  const ids = pending.map((b) => b.id);
  // One slot row per hour — that's the invariant createBookingAction writes.
  const expected = pending.reduce((sum, b) => sum + b.hours, 0);

  try {
    await prisma.$transaction(async (tx) => {
      // RE-ASSERT THE HOLD. This count check is the only thing standing
      // between a late webhook and a double-booked court: if the hold lapsed
      // and another player's reap already deleted one of these rows, the count
      // comes up short and we refuse to confirm.
      //
      // Nulling holdExpiresAt is also what makes the hours permanently ours —
      // a concurrent reap's `holdExpiresAt < now` delete stops matching, so
      // its own createMany hits the unique index and rolls back.
      const { count } = await tx.bookingSlot.updateMany({
        where: { bookingId: { in: ids } },
        data: { holdExpiresAt: null },
      });
      if (count !== expected) throw new LostHold();

      await tx.booking.updateMany({
        where: { id: { in: ids }, status: "PENDING" },
        data: { status: "CONFIRMED", holdExpiresAt: null },
      });

      await ensureServiceFeeCharge(tx, payment);
    });
  } catch (error) {
    if (!(error instanceof LostHold)) throw error;

    // The player paid and got nothing. There is no venue decision to make
    // here — unlike a cancellation, where the partner chooses — so this
    // refunds itself and tells them why.
    await prisma.$transaction([
      prisma.bookingSlot.deleteMany({ where: { bookingId: { in: ids } } }),
      prisma.booking.updateMany({
        where: { id: { in: ids }, status: "PENDING" },
        data: { status: "EXPIRED", holdExpiresAt: null },
      }),
    ]);

    const refund = await refundBookingPayment({
      paymentId,
      reason: "We couldn't hold your court — the reservation expired before payment completed.",
    });
    await recordAutomaticRefundFailure(paymentId, refund);
    return { status: "lost", refunded: refund.ok };
  }

  return { status: "confirmed", bookingIds: ids };
}

export type PaidEventRecoveryOutcome =
  | { status: "confirmed"; registrationId: string }
  | { status: "full" }
  | { status: "not-recoverable" };

async function occupiedEventSpotCount(
  tx: Prisma.TransactionClient,
  eventId: string,
  now: Date
): Promise<number> {
  const [registrations, guests, organizerGuests] = await Promise.all([
    tx.eventRegistration.count({
      where: {
        eventId,
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", holdExpiresAt: { gt: now } },
          {
            status: "PENDING",
            payment: { collectionMode: "MANUAL", manualSubmittedAt: { not: null } },
          },
        ],
      },
    }),
    tx.eventGuestSlot.count({
      where: {
        registration: { eventId },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING", holdExpiresAt: { gt: now } },
          {
            status: "PENDING",
            payment: { collectionMode: "MANUAL", manualSubmittedAt: { not: null } },
          },
        ],
      },
    }),
    tx.eventOrganizerGuest.count({
      where: { eventId, status: "CONFIRMED" },
    }),
  ]);
  return registrations + guests + organizerGuests;
}

// Repairs the narrow case where PayMongo accepted money just after the event
// hold expired and the automatic refund could not complete. Capacity is
// re-checked under the same event lock used by ordinary registration, so a
// paid player is restored only when doing so cannot oversell the event.
export async function recoverPaidEventRegistration(args: {
  eventId: string;
  userId: string;
}): Promise<PaidEventRecoveryOutcome> {
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${args.eventId} FOR UPDATE`
      );

      const event = await tx.event.findUnique({
        where: { id: args.eventId },
        select: { capacity: true, status: true, startsAt: true },
      });
      if (
        !event ||
        event.status !== "PUBLISHED" ||
        event.startsAt <= now
      ) {
        return { status: "not-recoverable" };
      }

      const registration = await tx.eventRegistration.findFirst({
        where: {
          eventId: args.eventId,
          userId: args.userId,
          payment: { status: "SUCCEEDED" },
        },
        select: {
          id: true,
          status: true,
          guests: {
            select: { id: true, bookingPaymentId: true, status: true },
          },
          payment: {
            select: {
              id: true,
              partnerId: true,
              platformFee: true,
              paidAt: true,
            },
          },
        },
      });
      if (!registration?.payment) return { status: "not-recoverable" };

      const paymentGuests = registration.guests.filter(
        (guest) => guest.bookingPaymentId === registration.payment!.id
      );
      if (
        registration.status === "CONFIRMED" &&
        paymentGuests.every((guest) => guest.status === "CONFIRMED")
      ) {
        await ensureServiceFeeCharge(tx, registration.payment);
        return { status: "confirmed", registrationId: registration.id };
      }
      if (registration.status !== "EXPIRED") {
        return { status: "not-recoverable" };
      }

      const occupied = await occupiedEventSpotCount(tx, args.eventId, now);
      const requestedSpots = 1 + paymentGuests.length;
      if (occupied + requestedSpots > event.capacity) {
        return { status: "full" };
      }

      const restored = await tx.eventRegistration.updateMany({
        where: {
          id: registration.id,
          status: "EXPIRED",
          bookingPaymentId: registration.payment.id,
        },
        data: {
          status: "CONFIRMED",
          holdExpiresAt: null,
          confirmedAt: now,
          cancelledAt: null,
          cancelReason: null,
        },
      });
      if (restored.count !== 1) throw new LostHold();

      if (paymentGuests.length > 0) {
        const restoredGuests = await tx.eventGuestSlot.updateMany({
          where: {
            id: { in: paymentGuests.map((guest) => guest.id) },
            status: { in: ["PENDING", "EXPIRED"] },
          },
          data: {
            status: "CONFIRMED",
            holdExpiresAt: null,
            confirmedAt: now,
            cancelledAt: null,
          },
        });
        if (restoredGuests.count !== paymentGuests.length) {
          throw new LostHold();
        }
      }

      await tx.bookingPayment.updateMany({
        where: { id: registration.payment.id, status: "SUCCEEDED" },
        data: { failureCode: null, failureMessage: null },
      });
      await ensureServiceFeeCharge(tx, registration.payment);
      return { status: "confirmed", registrationId: registration.id };
    });
  } catch (error) {
    if (error instanceof LostHold) return { status: "not-recoverable" };
    throw error;
  }
}

async function recoverPaidEventGuestSlots(
  paymentId: string
): Promise<PaidEventRecoveryOutcome> {
  const now = new Date();
  try {
    return await prisma.$transaction(async (tx) => {
      const initialPayment = await tx.bookingPayment.findFirst({
        where: {
          id: paymentId,
          status: "SUCCEEDED",
          eventGuestSlots: { some: {} },
        },
        select: {
          id: true,
          partnerId: true,
          platformFee: true,
          paidAt: true,
          eventGuestSlots: {
            take: 1,
            select: {
              id: true,
              registration: {
                select: {
                  id: true,
                  status: true,
                  event: {
                    select: {
                      id: true,
                      capacity: true,
                      status: true,
                      startsAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      const first = initialPayment?.eventGuestSlots[0];
      if (!initialPayment || !first) return { status: "not-recoverable" };

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Event" WHERE "id" = ${first.registration.event.id} FOR UPDATE`
      );
      const payment = await tx.bookingPayment.findFirst({
        where: { id: paymentId, status: "SUCCEEDED" },
        select: {
          id: true,
          partnerId: true,
          platformFee: true,
          paidAt: true,
          eventGuestSlots: {
            where: { status: { in: ["PENDING", "EXPIRED"] } },
            select: {
              id: true,
              registration: {
                select: {
                  id: true,
                  status: true,
                  event: {
                    select: {
                      id: true,
                      capacity: true,
                      status: true,
                      startsAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
      const lockedFirst = payment?.eventGuestSlots[0];
      if (!payment || !lockedFirst) {
        const confirmed = await tx.eventGuestSlot.findFirst({
          where: { bookingPaymentId: paymentId, status: "CONFIRMED" },
          select: { eventRegistrationId: true },
        });
        if (!confirmed) return { status: "not-recoverable" };
        await ensureServiceFeeCharge(tx, initialPayment);
        return {
          status: "confirmed",
          registrationId: confirmed.eventRegistrationId,
        };
      }

      const registration = lockedFirst.registration;
      if (
        registration.status !== "CONFIRMED" ||
        registration.event.status !== "PUBLISHED" ||
        registration.event.startsAt <= now
      ) {
        return { status: "not-recoverable" };
      }

      const occupied = await occupiedEventSpotCount(
        tx,
        registration.event.id,
        now
      );
      if (
        occupied + payment.eventGuestSlots.length >
        registration.event.capacity
      ) {
        return { status: "full" };
      }

      const restored = await tx.eventGuestSlot.updateMany({
        where: {
          id: { in: payment.eventGuestSlots.map((guest) => guest.id) },
          status: { in: ["PENDING", "EXPIRED"] },
        },
        data: {
          status: "CONFIRMED",
          holdExpiresAt: null,
          confirmedAt: now,
          cancelledAt: null,
        },
      });
      if (restored.count !== payment.eventGuestSlots.length) {
        throw new LostHold();
      }

      await tx.bookingPayment.update({
        where: { id: payment.id },
        data: { failureCode: null, failureMessage: null },
      });
      await ensureServiceFeeCharge(tx, payment);
      return { status: "confirmed", registrationId: registration.id };
    });
  } catch (error) {
    if (error instanceof LostHold) return { status: "not-recoverable" };
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Charging
// ---------------------------------------------------------------------------

export type ChargeOutcome =
  | { status: "confirmed" }
  | {
      status: "action";
      redirectUrl: string | null;
      qrImageUrl: string | null;
    }
  | { status: "pending" }
  | { status: "declined"; message: string }
  | { status: "expired" }
  | { status: "in-flight" }
  | { status: "already-paid" }
  | { status: "missing" };

function describe(lines: BookingPaymentLine[]): string {
  const first = lines[0];
  if (!first) return "Court booking";
  const head = `${first.courtName} — ${formatManilaDate(first.date)}, ${formatSlotRange(first.startHour, first.endHour)}`;
  return lines.length > 1 ? `${head} +${lines.length - 1} more` : head;
}

// The one place a player's money moves. Auth belongs to the caller; everything
// that has to be true about the payment itself is checked here.
export async function chargeBookingPayment(args: {
  paymentId: string;
  userId: string;
}): Promise<ChargeOutcome> {
  const { paymentId, userId } = args;

  const payment = await prisma.bookingPayment.findFirst({
    where: { id: paymentId, userId },
    select: { ...paymentSelect, gatewayId: true },
  });
  if (!payment) return { status: "missing" };
  if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") {
    return { status: "already-paid" };
  }
  if (payment.status !== "PENDING") return { status: "expired" };
  if (payment.collectionMode === "MANUAL") {
    return {
      status: "declined",
      message: "This venue reviews manual transfer receipts instead of charging through PayMongo.",
    };
  }

  const now = new Date();
  // Checked before any money moves, not after — a charge against a dead hold
  // is a refund we'd have to make.
  if (payment.expiresAt <= now) return { status: "expired" };
  // PayMongo's shortest QR lifetime is 60 seconds. Starting one later than
  // that would let the QR outlive the court hold and invite an auto-refund.
  if (payment.expiresAt.getTime() - now.getTime() < 60_000) {
    return { status: "expired" };
  }

  // THE double-charge guard:
  // whoever flips chargeStartedAt from null wins, everyone else is told the
  // charge is already in flight. Cleared again by a decline.
  const attempt = payment.attempt + 1;
  const graceExpiresAt =
    payment.attempt === 0
      ? new Date(
          Math.max(
            payment.expiresAt.getTime(),
            now.getTime() + PAYMENT_COMPLETION_GRACE_MINUTES * 60_000
          )
        )
      : payment.expiresAt;
  const processingFee =
    Number(payment.processingFee) > 0
      ? Number(payment.processingFee)
      : paymongoQrPhProcessingFeeFor(Number(payment.amount));
  const claim = await prisma.$transaction(async (tx) => {
    const claimed = await tx.bookingPayment.updateMany({
      where: {
        id: paymentId,
        status: "PENDING",
        chargeStartedAt: null,
        attempt: payment.attempt,
      },
      // `method` is already QRPH. The webhook still reports the actual source
      // so historical multi-method sessions remain compatible during rollout.
      data: {
        chargeStartedAt: now,
        attempt,
        redirectUrl: null,
        qrImageUrl: null,
        processingFee: new Prisma.Decimal(processingFee),
        expiresAt: graceExpiresAt,
      },
    });
    if (claimed.count !== 1) return claimed;

    const bookingIds = payment.bookings.map((booking) => booking.id);
    if (bookingIds.length > 0) {
      await tx.booking.updateMany({
        where: { id: { in: bookingIds }, status: "PENDING" },
        data: { holdExpiresAt: graceExpiresAt },
      });
      await tx.bookingSlot.updateMany({
        where: { bookingId: { in: bookingIds } },
        data: { holdExpiresAt: graceExpiresAt },
      });
    }
    if (payment.eventRegistration) {
      await tx.eventRegistration.updateMany({
        where: { id: payment.eventRegistration.id, status: "PENDING" },
        data: { holdExpiresAt: graceExpiresAt },
      });
    }
    if (payment.eventGuestSlots.length > 0) {
      await tx.eventGuestSlot.updateMany({
        where: { bookingPaymentId: payment.id, status: "PENDING" },
        data: { holdExpiresAt: graceExpiresAt },
      });
    }
    return claimed;
  });
  if (claim.count !== 1) return { status: "in-flight" };

  const lines = payment.bookings.map((b) => ({
    bookingId: b.id,
    courtName: b.court.name,
    date: b.date,
    startHour: b.startHour,
    endHour: b.endHour,
    hours: b.hours,
  }));
  const event =
    payment.eventRegistration?.event ??
    payment.eventGuestSlots[0]?.registration.event;

  let result: ChargeResult;
  try {
    if (!payment.gatewayId) {
      throw new Error("Automatic payment is missing its venue gateway.");
    }
    const creds = await loadGatewayCredentialsForCharge(payment.gatewayId);
    result = await getVenueGateway(creds).charge({
      amount: {
        amount: Number(payment.amount) + processingFee,
        currency: "PHP",
      },
      description: event
        ? `${event.title} — ${formatManilaDate(event.date)}, ${formatSlotRange(event.startHour, event.endHour)}`
        : describe(lines),
      // The gateway's own idempotency header too, so a retried request after a
      // network blip doesn't become a second charge.
      idempotencyKey: `${payment.id}:${attempt}`,
      expiresInSeconds: Math.max(
        60,
        Math.floor((graceExpiresAt.getTime() - now.getTime()) / 1000)
      ),
      metadata: {
        paymentId: payment.id,
        hubId: payment.hubId,
        ...(event ? { eventId: event.publicId } : {}),
      },
    });
  } catch (error) {
    // A gateway that threw may still have taken the money, so the row keeps
    // its providerPaymentId-less PENDING state and the claim is released for
    // the sweep or a retry to reconcile.
    await prisma.bookingPayment.update({
      where: { id: paymentId },
      data: {
        chargeStartedAt: null,
        failureCode: "gateway_error",
        failureMessage: "We couldn't reach the payment provider. Please try again.",
      },
    });
    if (process.env.NODE_ENV !== "production") console.error(error);
    return {
      status: "declined",
      message: "We couldn't reach the payment provider. Please try again.",
    };
  }

  await recordBookingChargeResult(payment.id, result);

  if (result.status === "succeeded") {
    const settled = await settleBookingPayment(payment.id);
    if (settled.status === "lost") {
      return {
        status: "declined",
        message: settled.refunded
          ? "Someone else took those hours before your payment finished, so we've refunded the venue amount. The service fee is non-refundable."
          : "Someone else took those hours before your payment finished. Your refund is being processed.",
      };
    }
    return { status: "confirmed" };
  }
  if (result.status === "requires_action") {
    return {
      status: "action",
      redirectUrl: result.redirectUrl,
      qrImageUrl: result.qrImageUrl,
    };
  }
  if (result.status === "pending") return { status: "pending" };
  return { status: "declined", message: result.message };
}

// The return leg: the browser comes back from a wallet or 3DS approval, which
// may beat the webhook. Polls the gateway and settles if it's done.
export async function pollBookingPayment(
  paymentId: string
): Promise<SettleOutcome | { status: "unresolved" }> {
  const payment = await prisma.bookingPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, gatewayId: true, providerPaymentId: true },
  });
  if (!payment) return { status: "missing" };
  if (payment.status === "SUCCEEDED") return settleBookingPayment(payment.id);
  if (payment.status !== "PENDING" || !payment.providerPaymentId) {
    return { status: "unresolved" };
  }

  if (!payment.gatewayId) return { status: "unresolved" };
  const creds = await loadGatewayCredentials(payment.gatewayId);
  const result = await getVenueGateway(creds).getCharge(payment.providerPaymentId);
  if (result.status === "pending") return { status: "unresolved" };

  await recordBookingChargeResult(payment.id, result);
  if (result.status !== "succeeded") return { status: "unresolved" };
  return settleBookingPayment(payment.id);
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

export type RefundOutcome =
  | { ok: true; alreadyRefunded: boolean }
  | { ok: false; message: string };

async function recordAutomaticRefundFailure(
  paymentId: string,
  refund: RefundOutcome
): Promise<void> {
  if (refund.ok) return;
  await prisma.bookingPayment.updateMany({
    where: { id: paymentId, status: "SUCCEEDED" },
    data: {
      failureCode: "automatic_refund_failed",
      failureMessage: `Automatic refund failed: ${refund.message}`,
    },
  });
}

// Works for a DISCONNECTED gateway too: the ciphertext is deliberately kept on
// disconnect precisely so a partner can still refund what they already took.
export async function refundBookingPayment(args: {
  paymentId: string;
  reason?: string;
  refundedById?: string;
}): Promise<RefundOutcome> {
  const payment = await prisma.bookingPayment.findUnique({
    where: { id: args.paymentId },
    select: {
      id: true,
      status: true,
      amount: true,
      platformFee: true,
      processingFee: true,
      collectionMode: true,
      gatewayId: true,
      providerPaymentId: true,
    },
  });
  if (!payment) return { ok: false, message: "Payment not found." };
  if (payment.status === "REFUNDED") return { ok: true, alreadyRefunded: true };
  if (payment.status !== "SUCCEEDED") {
    return { ok: false, message: "That payment has not settled yet." };
  }
  if (payment.collectionMode === "MANUAL") {
    return {
      ok: false,
      message:
        "Return the full venue amount through the original network, then record the external refund.",
    };
  }
  if (!payment.providerPaymentId) {
    return { ok: false, message: "That payment has no gateway reference to refund." };
  }

  // The Bunal.club service fee is earned when payment settles and remains
  // non-refundable. Return the venue amount and the checkout processing fee.
  const amount = Number(
    payment.amount.minus(payment.platformFee).plus(payment.processingFee).toFixed(2)
  );
  if (!payment.gatewayId) {
    return { ok: false, message: "That automatic payment has no gateway." };
  }
  const creds = await loadGatewayCredentials(payment.gatewayId);

  let gateway;
  try {
    gateway = getVenueGateway(creds);
  } catch (error) {
    // A payment taken through a gateway this app no longer supports. There is
    // nothing to call, and pretending otherwise would 500 a partner mid-refund.
    if (error instanceof UnknownVenueGateway) {
      return {
        ok: false,
        message: `${error.message} Refund it from that provider's own dashboard.`,
      };
    }
    throw error;
  }

  const result = await gateway.refund(
    payment.providerPaymentId,
    { amount, currency: "PHP" },
    args.reason
  );

  if (result.status === "failed") {
    return {
      ok: false,
      message: result.message || "The refund was rejected by the payment provider.",
    };
  }

  await markBookingPaymentRefunded({
    paymentId: payment.id,
    amount: result.amount.amount,
    refundRef: result.refundId,
    reason: args.reason,
    refundedById: args.refundedById,
  });

  return { ok: true, alreadyRefunded: false };
}

// Writes the refund onto the ledger WITHOUT asking the gateway for one. Used
// by refundBookingPayment once its call has succeeded, and by the webhook when
// a partner refunds from their gateway's own dashboard — where asking again
// would issue a second refund.
export async function markBookingPaymentRefunded(args: {
  paymentId: string;
  amount: number;
  refundRef: string | null;
  reason?: string;
  refundedById?: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.bookingPayment.updateMany({
      // Re-asserted: two legs can arrive at once, and the loser must not
      // overwrite the winner's reference or duplicate ledger work.
      where: { id: args.paymentId, status: { not: "REFUNDED" } },
      data: {
        status: "REFUNDED",
        refundedAt: new Date(),
        refundedAmount: new Prisma.Decimal(args.amount),
        refundRef: args.refundRef,
        refundReason: args.reason ?? null,
        refundedById: args.refundedById ?? null,
      },
    });
    if (updated.count !== 1) return;

    const payment = await tx.bookingPayment.findUnique({
      where: { id: args.paymentId },
      select: {
        id: true,
        partnerId: true,
        platformFee: true,
        paidAt: true,
      },
    });
    // Retain the service fee on every refund path. This also records the fee
    // for a paid checkout whose court hold was lost before confirmation.
    if (payment) await ensureServiceFeeCharge(tx, payment);
  });
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

// Hygiene ONLY. Every read is already time-based (see liveBookingWhere and the
// slot predicate in bookings.ts), so an expired hold stops blocking the grid
// the instant it lapses whether or not this ever runs. What this does is tidy
// the rows: delete slots nothing is holding, flip PENDING to EXPIRED so the
// player's History reads correctly without a per-row clock comparison, and
// close out payments whose window has passed.
export async function expireBookingHolds(now: Date = new Date()): Promise<{
  bookings: number;
  eventRegistrations: number;
  eventGuestSlots: number;
  slots: number;
  payments: number;
}> {
  const swept = await prisma.$transaction(async (tx) => {
    const candidates = await tx.booking.findMany({
      where: { status: "PENDING", holdExpiresAt: { lte: now } },
      select: { id: true },
    });
    if (candidates.length === 0) return { slots: 0, bookings: 0 };

    const candidateIds = candidates.map((booking) => booking.id);

    // Settlement and cleanup must lock rows in the same order: slots first,
    // then bookings. If payment confirmation already owns a slot lock, this
    // waits for it and the re-read below sees CONFIRMED. If cleanup owns the
    // lock first, settlement sees the missing slot and takes its LostHold +
    // refund path. There is no state where a CONFIRMED booking loses its slot.
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "BookingSlot"
                 WHERE "bookingId" IN (${Prisma.join(candidateIds)})
                 FOR UPDATE`
    );

    // The candidate read intentionally happened before the slot locks. Re-read
    // after acquiring them so a payment that committed while we waited is not
    // cleaned up from a stale snapshot.
    const stillExpired = await tx.booking.findMany({
      where: {
        id: { in: candidateIds },
        status: "PENDING",
        holdExpiresAt: { lte: now },
      },
      select: { id: true },
    });
    const ids = stillExpired.map((booking) => booking.id);
    if (ids.length === 0) return { slots: 0, bookings: 0 };

    const deleted = await tx.bookingSlot.deleteMany({
      where: { bookingId: { in: ids } },
    });
    const expired = await tx.booking.updateMany({
      where: {
        id: { in: ids },
        status: "PENDING",
        holdExpiresAt: { lte: now },
      },
      data: { status: "EXPIRED", holdExpiresAt: null },
    });

    return { slots: deleted.count, bookings: expired.count };
  });

  const eventRegistrations = await prisma.eventRegistration.updateMany({
    where: { status: "PENDING", holdExpiresAt: { lte: now } },
    data: { status: "EXPIRED", holdExpiresAt: null },
  });
  const eventGuestSlots = await prisma.eventGuestSlot.updateMany({
    where: { status: "PENDING", holdExpiresAt: { lte: now } },
    data: { status: "EXPIRED", holdExpiresAt: null },
  });

  // A payment whose hold is gone can never be settled, so it's terminal now —
  // this is the ONLY place a BookingPayment becomes FAILED. Rows with a charge
  // still in flight are left alone: their webhook may yet land, and settle
  // handles that case by refunding.
  const payments = await prisma.bookingPayment.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now },
      chargeStartedAt: null,
      manualSubmittedAt: null,
    },
    data: {
      status: "FAILED",
      failureCode: "hold_expired",
      failureMessage: `The ${BOOKING_HOLD_MINUTES}-minute hold expired before payment was completed.`,
    },
  });

  return {
    bookings: swept.bookings,
    eventRegistrations: eventRegistrations.count,
    eventGuestSlots: eventGuestSlots.count,
    slots: swept.slots,
    payments: payments.count,
  };
}
