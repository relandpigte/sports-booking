import "server-only";

import { loadPlatformCredentialsForExistingPayment } from "@/lib/platform-gateway";

import type { ProviderWebhookEvent } from "./types";
import {
  paidPayment,
  parsePaymongoEvent,
  verifyPaymongoSignature,
} from "./paymongo-core";
import { mapPaymongoPaymentEvent } from "./paymongo-venue";

// The one account receives direct QR Ph payments from players, plus, rarely,
// an event for a legacy hosted-checkout service-fee settlement (no new ones
// can be started). They are told apart by the resource the event
// names — a checkout session or a payment intent — never by guessing.
export type PlatformWebhookDelivery =
  // Unsigned, mis-signed, or unparseable. The only case answered with 400.
  | { kind: "invalid" }
  // Correctly signed but nothing this app acts on. Answered with 200 so
  // PayMongo does not retry a delivery that can never be processed.
  | { kind: "ignored" }
  | { kind: "settlement"; event: ProviderWebhookEvent }
  | { kind: "payment"; event: ProviderWebhookEvent };

export async function readPlatformPaymongoWebhook(
  rawBody: string,
  headers: Headers
): Promise<PlatformWebhookDelivery> {
  let webhookSecret: string | null;
  let connected: boolean;
  try {
    // A player payment taken before the account was disconnected must still
    // settle, so verification does not require a live connection.
    ({ webhookSecret, connected } =
      await loadPlatformCredentialsForExistingPayment());
  } catch {
    return { kind: "invalid" };
  }
  // No secret means no verification is possible. Never fall through to an
  // HMAC with an empty key.
  if (!webhookSecret) return { kind: "invalid" };
  const valid = verifyPaymongoSignature(
    webhookSecret,
    rawBody,
    headers.get("paymongo-signature"),
    Math.floor(Date.now() / 1000)
  );
  if (!valid) return { kind: "invalid" };

  const parsed = parsePaymongoEvent(rawBody);
  if (!parsed) return { kind: "invalid" };

  const attributes = parsed.attributes as {
    checkout_session_id?: string;
    payment_intent_id?: string;
  };
  const settlementEvent =
    parsed.type === "checkout_session.payment.paid" ||
    (parsed.type === "payment.failed" && Boolean(attributes.checkout_session_id));

  if (settlementEvent) {
    // Settlement collection stops with the connection, as it always has.
    if (!connected) return { kind: "invalid" };
    const event = mapPlatformSettlementEvent(parsed, rawBody);
    return event ? { kind: "settlement", event } : { kind: "ignored" };
  }

  if (
    attributes.payment_intent_id &&
    (parsed.type === "payment.paid" ||
      parsed.type === "payment.failed" ||
      parsed.type === "payment.refunded")
  ) {
    const event = mapPaymongoPaymentEvent(parsed, rawBody);
    return event ? { kind: "payment", event } : { kind: "ignored" };
  }

  return { kind: "ignored" };
}

function mapPlatformSettlementEvent(
  event: NonNullable<ReturnType<typeof parsePaymongoEvent>>,
  rawBody: string
): ProviderWebhookEvent | null {
  if (event.type === "checkout_session.payment.paid") {
    const session = event.attributes as {
      payments?: {
        id?: string;
        attributes?: {
          amount?: number;
          fee?: number;
          status?: string;
          source?: { type?: string };
        };
      }[];
    };
    const paid = paidPayment(session);
    return {
      eventId: event.eventId,
      providerPaymentId: event.resourceId,
      type: "payment.succeeded",
      reference: paid?.id ?? null,
      failureCode: null,
      failureMessage: null,
      amountCentavos: paid?.attributes?.amount,
      feeCentavos: paid?.attributes?.fee,
      raw: JSON.parse(rawBody),
    };
  }

  if (event.type === "payment.failed") {
    const payment = event.attributes as {
      checkout_session_id?: string;
      last_payment_error?: string;
    };
    if (!payment.checkout_session_id) return null;
    return {
      eventId: event.eventId,
      providerPaymentId: payment.checkout_session_id,
      type: "payment.failed",
      reference: event.resourceId,
      failureCode: "payment_failed",
      failureMessage:
        payment.last_payment_error ?? "The PayMongo payment was not completed.",
      amountCentavos: undefined,
      raw: JSON.parse(rawBody),
    };
  }

  return null;
}
