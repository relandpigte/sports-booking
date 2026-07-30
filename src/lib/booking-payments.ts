import "server-only";

import { Prisma, type PaymentMethodType, type PaymentStatus } from "@prisma/client";

import { prisma } from "@/lib/db";
import { loadGatewayCredentials } from "@/lib/partner-gateway";
import { getVenueGateway, UnknownVenueGateway } from "@/lib/payments/venue";
import type { ChargeResult } from "@/lib/payments/types";
import { appUrl } from "@/lib/urls";
import { formatManilaDate, formatSlotRange } from "@/lib/time";
import { ensureServiceFeeCharge } from "@/lib/service-fees";

// Players paying venues through each partner's own gateway.
//
// The rule this whole file is built around: a BookingPayment stays PENDING for
// as long as its hold is alive, however many cards get declined against it.
// PENDING means "the hours are still yours and no money has moved"; SUCCEEDED
// means the money moved; FAILED is terminal and only ever set once the hold is
// dead. That's what lets a player retry a declined card without us creating a
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
  // Checkout subtotal: venueAmount + platformFee. PayMongo's processing fee is
  // calculated and added on its hosted page.
  amount: number;
  venueAmount: number;
  platformFee: number;
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
  providerPaymentId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
  refundedAmount: number | null;
  refundReason: string | null;
  hubId: string;
  lines: BookingPaymentLine[];
};

const paymentSelect = {
  id: true,
  status: true,
  method: true,
  provider: true,
  amount: true,
  venueAmount: true,
  platformFee: true,
  currency: true,
  expiresAt: true,
  attempt: true,
  chargeStartedAt: true,
  redirectUrl: true,
  providerPaymentId: true,
  failureCode: true,
  failureMessage: true,
  paidAt: true,
  refundedAt: true,
  refundedAmount: true,
  refundReason: true,
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
} as const;

type PaymentRow = Prisma.BookingPaymentGetPayload<{
  select: typeof paymentSelect;
}>;

export function mapBookingPayment(row: PaymentRow): BookingPaymentView {
  return {
    id: row.id,
    status: row.status,
    method: row.method,
    amount: Number(row.amount),
    venueAmount: Number(row.venueAmount),
    platformFee: Number(row.platformFee),
    currency: row.currency,
    expiresAt: row.expiresAt,
    secondsLeft: Math.max(
      0,
      Math.round((row.expiresAt.getTime() - Date.now()) / 1000)
    ),
    attempt: row.attempt,
    chargeInFlight: row.chargeStartedAt != null,
    redirectUrl: row.redirectUrl,
    providerPaymentId: row.providerPaymentId,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    paidAt: row.paidAt,
    refundedAt: row.refundedAt,
    refundedAmount: row.refundedAmount != null ? Number(row.refundedAmount) : null,
    refundReason: row.refundReason,
    hubId: row.hubId,
    lines: row.bookings.map((b) => ({
      bookingId: b.id,
      courtName: b.court.name,
      date: b.date,
      startHour: b.startHour,
      endHour: b.endHour,
      hours: b.hours,
    })),
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
): Promise<{ payment: BookingPaymentView; venueName: string } | null> {
  const payment = await getBookingPaymentForPlayer(paymentId, userId);
  if (!payment) return null;

  const hub = await prisma.hub.findUnique({
    where: { id: payment.hubId },
    select: { name: true },
  });
  return { payment, venueName: hub?.name ?? "the venue" };
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
  // PENDING and the claim is released — the player can try another card
  // against this same payment. Only expireBookingHolds writes FAILED.
  await prisma.bookingPayment.update({
    where: { id: paymentId },
    data: {
      status: "PENDING",
      providerPaymentId: result.paymentId,
      failureCode: result.code,
      failureMessage: result.message,
      chargeStartedAt: null,
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
  | { status: "confirmed"; bookingIds: string[] }
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
      status: true,
      partnerId: true,
      platformFee: true,
      paidAt: true,
      bookings: { select: { id: true, status: true, hours: true } },
    },
  });
  if (!payment) return { status: "missing" };
  if (payment.status === "REFUNDED") return { status: "already" };
  if (payment.status !== "SUCCEEDED") return { status: "not-paid" };

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
    return { status: "lost", refunded: refund.ok };
  }

  return { status: "confirmed", bookingIds: ids };
}

// ---------------------------------------------------------------------------
// Charging
// ---------------------------------------------------------------------------

export type ChargeOutcome =
  | { status: "confirmed" }
  | { status: "redirect"; url: string }
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

  const now = new Date();
  // Checked before any money moves, not after — a charge against a dead hold
  // is a refund we'd have to make.
  if (payment.expiresAt <= now) return { status: "expired" };

  // THE double-charge guard:
  // whoever flips chargeStartedAt from null wins, everyone else is told the
  // charge is already in flight. Cleared again by a decline.
  const attempt = payment.attempt + 1;
  const claim = await prisma.bookingPayment.updateMany({
    where: {
      id: paymentId,
      status: "PENDING",
      chargeStartedAt: null,
      attempt: payment.attempt,
    },
    // `method` is deliberately untouched: the player chooses card, GCash or
    // Maya on PayMongo's page, and the webhook tells us which afterwards.
    data: { chargeStartedAt: now, attempt, redirectUrl: null },
  });
  if (claim.count !== 1) return { status: "in-flight" };

  const creds = await loadGatewayCredentials(payment.gatewayId);
  const lines = payment.bookings.map((b) => ({
    bookingId: b.id,
    courtName: b.court.name,
    date: b.date,
    startHour: b.startHour,
    endHour: b.endHour,
    hours: b.hours,
  }));

  let result: ChargeResult;
  try {
    result = await getVenueGateway(creds).charge({
      amount: { amount: Number(payment.amount), currency: "PHP" },
      description: describe(lines),
      // The gateway's own idempotency header too, so a retried request after a
      // network blip doesn't become a second charge.
      idempotencyKey: `${payment.id}:${attempt}`,
      returnUrl: appUrl(`/dashboard/bookings/pay/${payment.id}`),
      metadata: { paymentId: payment.id, hubId: payment.hubId },
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
          ? "Someone else took those hours before your payment finished, so we've refunded the booking subtotal."
          : "Someone else took those hours before your payment finished. Your refund is being processed.",
      };
    }
    return { status: "confirmed" };
  }
  if (result.status === "requires_action") {
    return { status: "redirect", url: result.redirectUrl };
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
      gatewayId: true,
      providerPaymentId: true,
    },
  });
  if (!payment) return { ok: false, message: "Payment not found." };
  if (payment.status === "REFUNDED") return { ok: true, alreadyRefunded: true };
  if (payment.status !== "SUCCEEDED") {
    return { ok: false, message: "That booking hasn't been paid for." };
  }
  if (!payment.providerPaymentId) {
    return { ok: false, message: "That payment has no gateway reference to refund." };
  }

  const amount = Number(payment.amount);
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
      // overwrite the winner's reference or reverse the fee twice.
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

    const charge = await tx.serviceFeeEntry.findUnique({
      where: {
        bookingPaymentId_type: {
          bookingPaymentId: args.paymentId,
          type: "CHARGE",
        },
      },
      select: { partnerId: true, amount: true },
    });
    // A paid checkout whose court hold was lost is refunded before it ever
    // earns a service fee, so it has no charge to reverse.
    if (!charge) return;

    await tx.serviceFeeEntry.upsert({
      where: {
        bookingPaymentId_type: {
          bookingPaymentId: args.paymentId,
          type: "REFUND",
        },
      },
      create: {
        partnerId: charge.partnerId,
        bookingPaymentId: args.paymentId,
        type: "REFUND",
        amount: charge.amount.negated(),
      },
      update: {},
    });
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
  slots: number;
  payments: number;
}> {
  const dead = await prisma.booking.findMany({
    where: { status: "PENDING", holdExpiresAt: { lte: now } },
    select: { id: true },
  });

  let slots = 0;
  let bookings = 0;
  if (dead.length) {
    const ids = dead.map((b) => b.id);
    const [deleted, expired] = await prisma.$transaction([
      prisma.bookingSlot.deleteMany({ where: { bookingId: { in: ids } } }),
      prisma.booking.updateMany({
        // status re-asserted: a payment may have confirmed it since the read.
        where: { id: { in: ids }, status: "PENDING" },
        data: { status: "EXPIRED", holdExpiresAt: null },
      }),
    ]);
    slots = deleted.count;
    bookings = expired.count;
  }

  // A payment whose hold is gone can never be settled, so it's terminal now —
  // this is the ONLY place a BookingPayment becomes FAILED. Rows with a charge
  // still in flight are left alone: their webhook may yet land, and settle
  // handles that case by refunding.
  const payments = await prisma.bookingPayment.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now }, chargeStartedAt: null },
    data: {
      status: "FAILED",
      failureCode: "hold_expired",
      failureMessage: "The 15-minute hold expired before payment was completed.",
    },
  });

  return { bookings, slots, payments: payments.count };
}
