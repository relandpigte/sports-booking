import "server-only";

import {
  loadPlatformCredentialsForExistingPayment,
  loadPlatformGatewayCredentials,
  platformGatewayConfigured,
} from "@/lib/platform-gateway";
import { appUrl } from "@/lib/urls";

import type { ProviderWebhookEvent } from "./types";
import {
  PayMongoRequestError,
  createCheckoutSession,
  getCheckoutSession,
  paidPayment,
  parsePaymongoEvent,
  verifyPaymongoSignature,
} from "./paymongo-core";
import { mapPaymongoPaymentEvent } from "./paymongo-venue";

export const platformPaymongoConfigured = platformGatewayConfigured;

type PlatformServiceFeeCheckoutInput = {
  settlementId: string;
  accountId: string;
  accountName: string;
  accountType: "partner" | "trainer";
  amount: number;
};

async function createPlatformServiceFeeCheckout(
  input: PlatformServiceFeeCheckoutInput
): Promise<{
  providerPaymentId: string;
  redirectUrl: string;
  raw: unknown;
}> {
  const { secretKey } = await loadPlatformGatewayCredentials();
  const returnPath =
    input.accountType === "trainer"
      ? "/dashboard/trainer/payments"
      : "/dashboard/payments";
  const accountMetadata: Record<string, string> =
    input.accountType === "trainer"
      ? {
          trainerId: input.accountId,
          trainerName: input.accountName.slice(0, 120),
        }
      : {
          partnerId: input.accountId,
          partnerName: input.accountName.slice(0, 120),
        };
  const session = await createCheckoutSession(secretKey, {
    amountPesos: input.amount,
    description: "Bunal.club service-fee settlement",
    referenceNumber: input.settlementId,
    returnUrl: appUrl(
      `${returnPath}?settlement=${encodeURIComponent(input.settlementId)}`
    ),
    metadata: {
      settlementId: input.settlementId,
      accountType: input.accountType,
      accountId: input.accountId,
      accountName: input.accountName.slice(0, 120),
      ...accountMetadata,
    },
    // QR Ph is the single online payment rail across player payments and
    // partner and trainer service-fee settlements.
    paymentMethodTypes: ["qrph"],
    // Partners and trainers pay exactly the displayed balance. Bunal.club
    // absorbs this collection fee.
    passOnFees: false,
    idempotencyKey:
      input.accountType === "partner"
        ? `service-fee:${input.settlementId}`
        : `trainer-service-fee:${input.settlementId}`,
  });

  if (!session.attributes.checkout_url) {
    throw new PayMongoRequestError(
      502,
      "no_checkout_url",
      "PayMongo did not return a settlement checkout page."
    );
  }

  return {
    providerPaymentId: session.id,
    redirectUrl: session.attributes.checkout_url,
    raw: session.attributes,
  };
}

export function createServiceFeeCheckout(input: {
  settlementId: string;
  partnerId: string;
  partnerName: string;
  amount: number;
}) {
  return createPlatformServiceFeeCheckout({
    settlementId: input.settlementId,
    accountId: input.partnerId,
    accountName: input.partnerName,
    accountType: "partner",
    amount: input.amount,
  });
}

export function createTrainerServiceFeeCheckout(input: {
  settlementId: string;
  trainerId: string;
  trainerName: string;
  amount: number;
}) {
  return createPlatformServiceFeeCheckout({
    settlementId: input.settlementId,
    accountId: input.trainerId,
    accountName: input.trainerName,
    accountType: "trainer",
    amount: input.amount,
  });
}

export async function getServiceFeeCheckout(providerPaymentId: string) {
  const { secretKey } = await loadPlatformGatewayCredentials();
  return getCheckoutSession(secretKey, providerPaymentId);
}

// What a delivery to Bunal.club's own PayMongo webhook turned out to be.
//
// The one account now receives two unrelated kinds of money: hosted-checkout
// service-fee settlements from partners and trainers, and direct QR Ph
// payments from players. They are told apart by the resource the event
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

// The service-fee settlement view of a platform delivery. Kept for callers
// that only handle settlements.
export async function verifyPlatformPaymongoWebhook(
  rawBody: string,
  headers: Headers
): Promise<ProviderWebhookEvent | null> {
  const delivery = await readPlatformPaymongoWebhook(rawBody, headers);
  return delivery.kind === "settlement" ? delivery.event : null;
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
