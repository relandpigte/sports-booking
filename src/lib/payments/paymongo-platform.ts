import "server-only";

import {
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

export const platformPaymongoConfigured = platformGatewayConfigured;

export async function createServiceFeeCheckout(input: {
  settlementId: string;
  partnerId: string;
  partnerName: string;
  amount: number;
}): Promise<{
  providerPaymentId: string;
  redirectUrl: string;
  raw: unknown;
}> {
  const { secretKey } = await loadPlatformGatewayCredentials();
  const session = await createCheckoutSession(secretKey, {
    amountPesos: input.amount,
    description: "Bunal.club service-fee settlement",
    referenceNumber: input.settlementId,
    returnUrl: appUrl(
      `/dashboard/payments?settlement=${encodeURIComponent(input.settlementId)}`
    ),
    metadata: {
      settlementId: input.settlementId,
      partnerId: input.partnerId,
      partnerName: input.partnerName.slice(0, 120),
    },
    // Keep every settlement method on PayMongo's hosted page. No card or
    // wallet details pass through this application.
    paymentMethodTypes: ["qrph", "card", "gcash", "paymaya"],
    // The admin receives the complete service-fee balance. PayMongo shows its
    // processing fee separately to the paying partner.
    passOnFees: true,
    idempotencyKey: `service-fee:${input.settlementId}`,
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

export async function getServiceFeeCheckout(providerPaymentId: string) {
  const { secretKey } = await loadPlatformGatewayCredentials();
  return getCheckoutSession(secretKey, providerPaymentId);
}

export async function verifyPlatformPaymongoWebhook(
  rawBody: string,
  headers: Headers
): Promise<ProviderWebhookEvent | null> {
  let webhookSecret: string | null;
  try {
    ({ webhookSecret } = await loadPlatformGatewayCredentials());
  } catch {
    return null;
  }
  if (!webhookSecret) return null;
  const valid = verifyPaymongoSignature(
    webhookSecret,
    rawBody,
    headers.get("paymongo-signature"),
    Math.floor(Date.now() / 1000)
  );
  if (!valid) return null;

  const event = parsePaymongoEvent(rawBody);
  if (!event) return null;

  if (event.type === "checkout_session.payment.paid") {
    const session = event.attributes as {
      payments?: {
        id?: string;
        attributes?: {
          amount?: number;
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
