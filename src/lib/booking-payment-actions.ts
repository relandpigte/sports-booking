"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import { CardSchema, PayBookingSchema } from "@/lib/validation";
import { chargeBookingPayment } from "@/lib/booking-payments";
import { handleVenueEvent } from "@/lib/booking-webhook";
import { loadGatewayCredentials } from "@/lib/partner-gateway";
import { getVenueGateway } from "@/lib/payments/venue";

// Deliberately NO `values` field — a card number must never round-trip
// through form state. Same rule as the subscription checkout.
export type PayBookingFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  // Set when the gateway wants the payer to approve elsewhere. The client
  // sends the browser there; the hold keeps running while they're away.
  redirectUrl?: string;
};

function revalidatePayment(paymentId: string, hubId?: string) {
  revalidatePath(`/dashboard/bookings/pay/${paymentId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  if (hubId) revalidatePath(`/hubs/${hubId}`);
}

export async function payForBookingAction(
  _prev: PayBookingFormState,
  formData: FormData
): Promise<PayBookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to pay for your booking." };

  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
    method: String(formData.get("method") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Card details are their own schema, parsed only when they're needed, and
  // never merged into anything that gets echoed back.
  let card: Parameters<typeof chargeBookingPayment>[0]["card"];
  if (parsed.data.method === "CARD") {
    const cardParsed = CardSchema.safeParse({
      cardName: String(formData.get("cardName") ?? ""),
      cardNumber: String(formData.get("cardNumber") ?? ""),
      cardExpMonth: String(formData.get("cardExpMonth") ?? ""),
      cardExpYear: String(formData.get("cardExpYear") ?? ""),
      cardCvc: String(formData.get("cardCvc") ?? ""),
    });
    if (!cardParsed.success) return { errors: firstErrors(cardParsed.error) };
    card = {
      number: cardParsed.data.cardNumber,
      expMonth: cardParsed.data.cardExpMonth,
      expYear: cardParsed.data.cardExpYear,
      cvc: cardParsed.data.cardCvc,
      name: cardParsed.data.cardName,
    };
  }

  // Ownership is enforced inside, in the where clause.
  const outcome = await chargeBookingPayment({
    paymentId: parsed.data.paymentId,
    userId: viewer.id,
    method: parsed.data.method,
    card,
  });

  revalidatePayment(parsed.data.paymentId);

  switch (outcome.status) {
    case "confirmed":
      return { success: "Paid. Your court is confirmed." };
    case "redirect":
      return { redirectUrl: outcome.url };
    case "pending":
      return {
        success:
          "Your payment is being processed. This page updates as soon as it clears.",
      };
    case "declined":
      return { message: outcome.message };
    case "expired":
      return {
        message:
          "This hold has expired and the hours have been released. Nothing was charged — please book again.",
      };
    case "in-flight":
      return { message: "That payment is already being processed." };
    case "already-paid":
      return { success: "This booking is already paid for." };
    default:
      return { message: "We couldn't find that payment." };
  }
}

// --- The simulated wallet / 3DS approval screen ----------------------------

// Stands in for the page a real gateway hosts itself. Approving here posts a
// correctly signed body to the SAME handler the real webhook route uses, so
// signature verification, replay protection and settlement are all exercised
// rather than bypassed.
export async function simulateBookingCheckoutAction(
  _prev: PayBookingFormState,
  formData: FormData
): Promise<PayBookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to continue." };

  const paymentId = String(formData.get("paymentId") ?? "");
  const approve = String(formData.get("outcome") ?? "") === "approve";

  // Ownership in the where clause, like every other action here.
  const payment = await prisma.bookingPayment.findFirst({
    where: { id: paymentId, userId: viewer.id },
    select: {
      id: true,
      status: true,
      hubId: true,
      gatewayId: true,
      provider: true,
      providerPaymentId: true,
    },
  });
  if (!payment) return { message: "Payment not found." };
  if (payment.provider !== "fake") return { message: "Not available." };
  if (payment.status !== "PENDING") {
    return { message: "That payment is already settled." };
  }

  const { signVenueWebhookBody } = await import("@/lib/payments/fake-venue");
  const creds = await loadGatewayCredentials(payment.gatewayId);

  const body = JSON.stringify({
    eventId: `evt_${payment.id}_${approve ? "ok" : "fail"}`,
    type: approve ? "payment.succeeded" : "payment.failed",
    providerPaymentId: payment.providerPaymentId ?? `fake_pi_${payment.id}`,
    reference: approve ? `fake_ref_${payment.id.slice(-8)}` : null,
    failureCode: approve ? null : "declined_by_user",
    failureMessage: approve ? null : "You declined the payment.",
  });

  const event = await getVenueGateway(creds).verifyWebhook(
    body,
    new Headers({
      "x-venue-signature": signVenueWebhookBody(creds.webhookSecret, body),
    })
  );
  if (!event) return { message: "Could not verify the payment." };

  const result = await handleVenueEvent({
    gatewayId: payment.gatewayId,
    event,
    knownPaymentId: payment.id,
  });

  revalidatePayment(payment.id, payment.hubId);

  if (!approve) return { message: "Payment declined. Your hold is still live." };
  if (result.reason === "lost") {
    return {
      message:
        "Someone else took those hours before your payment finished, so we've refunded you in full.",
    };
  }
  return { success: "Payment received. Your court is confirmed." };
}
