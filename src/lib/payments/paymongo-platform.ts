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
    // absorbs this collection fee as part of the all-inclusive 3% policy.
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
