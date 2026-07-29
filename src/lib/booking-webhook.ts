import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  markBookingPaymentRefunded,
  recordBookingChargeResult,
  settleBookingPayment,
} from "@/lib/booking-payments";
import type { ProviderWebhookEvent } from "@/lib/payments/types";

export type VenueEventResult = { applied: boolean; reason?: string };

// Applies a VERIFIED event from a partner's own gateway.
//
// Shared by the webhook route and the local stub approval, so both take the
// identical path — the stub is not a shortcut around the real logic.
//
// Idempotent twice over: ProviderEvent's unique (provider, eventId) absorbs a
// replayed delivery, and settleBookingPayment is a no-op once the bookings are
// confirmed.
export async function handleVenueEvent(args: {
  gatewayId: string;
  event: ProviderWebhookEvent;
  // The stub knows the payment directly; a real gateway only sends us its own
  // payment id.
  knownPaymentId?: string;
}): Promise<VenueEventResult> {
  const { gatewayId, event } = args;

  // Namespaced per gateway. Two partners' gateways can legitimately issue the
  // same event id, and without this the first one to arrive would silently
  // swallow the other partner's payment as a "duplicate".
  const provider = `venue:${gatewayId}`;

  try {
    await prisma.providerEvent.create({
      data: {
        provider,
        eventId: event.eventId,
        type: event.type,
        payload: event.raw as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Gateways retry deliveries; this is normal, not an error.
      return { applied: false, reason: "duplicate" };
    }
    throw error;
  }

  // Scoped to THIS gateway, so partner A can never settle partner B's payment
  // by quoting its provider payment id.
  const payment = await prisma.bookingPayment.findFirst({
    where: args.knownPaymentId
      ? { id: args.knownPaymentId, gatewayId }
      : { providerPaymentId: event.providerPaymentId, gatewayId },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, amount: true },
  });
  if (!payment) return { applied: false, reason: "unknown payment" };

  if (event.type === "payment.succeeded") {
    if (payment.status === "SUCCEEDED") {
      // The browser's return leg beat the webhook. Settling again is safe and
      // covers the case where it got as far as paying but not as far as
      // confirming.
      const settled = await settleBookingPayment(payment.id);
      return { applied: settled.status === "confirmed", reason: settled.status };
    }
    if (payment.status !== "PENDING") {
      return { applied: false, reason: "already settled" };
    }

    // With a hosted checkout this is the first moment we learn how they paid —
    // the row was created before they had chosen. Written before settling so
    // the confirmation the player sees names the right method.
    if (event.methodType) {
      await prisma.bookingPayment.update({
        where: { id: payment.id },
        data: { method: event.methodType },
      });
    }

    await recordBookingChargeResult(payment.id, {
      status: "succeeded",
      paymentId: event.providerPaymentId,
      reference: event.reference,
      raw: event.raw,
    });
    const settled = await settleBookingPayment(payment.id);
    return { applied: true, reason: settled.status };
  }

  if (event.type === "payment.failed") {
    if (payment.status !== "PENDING") {
      return { applied: false, reason: "already settled" };
    }
    // Stays PENDING with the claim released — the hold may still have time on
    // it and the player can try another card. See booking-payments.ts.
    await recordBookingChargeResult(payment.id, {
      status: "failed",
      paymentId: event.providerPaymentId,
      code: event.failureCode ?? "payment_failed",
      message: event.failureMessage ?? "The payment was not completed.",
      raw: event.raw,
    });
    return { applied: true };
  }

  // payment.refunded — the partner refunded from their gateway's own dashboard
  // rather than from here. Mirror it onto the ledger WITHOUT calling refund
  // again, which would take the money back twice.
  //
  // The bookings are deliberately left alone: refunding at the gateway is a
  // money decision, and only the cancel flow decides the court is free again.
  if (payment.status !== "SUCCEEDED") {
    return { applied: false, reason: "not paid" };
  }
  await markBookingPaymentRefunded({
    paymentId: payment.id,
    amount: Number(payment.amount),
    refundRef: event.reference,
    reason: "Refunded from the payment provider.",
  });
  return { applied: true };
}
