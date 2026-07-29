import "server-only";

import { appUrl } from "@/lib/urls";

import type {
  ChargeInput,
  ChargeResult,
  Money,
  PaymentProvider,
  ProviderWebhookEvent,
  RefundResult,
} from "./types";
import {
  MIN_CENTAVOS,
  PayMongoRequestError,
  createCheckoutSession,
  createRefund,
  getCheckoutSession,
  paidPayment,
  parsePaymongoEvent,
  resolvePaymentId,
  toCentavos,
  verifyPaymongoSignature,
} from "./paymongo-core";

// PayMongo for the PLATFORM's own account: partners paying Bunal.ph for their
// monthly plan. The mirror image of paymongo-venue.ts, which uses each
// partner's account for players paying them — same API, same core, different
// keys and a different direction of money.
//
// Hosted checkout, which has one consequence worth stating plainly: PayMongo
// cannot auto-debit a saved card outside its Subscriptions API, so NOTHING
// here renews silently. A period ends, the subscription goes PAST_DUE with its
// grace window, and the partner pays a link. That is the same path GCash and
// Maya have always taken, so billing.ts needed no changes — see the autoRenew
// branch in evaluateOnce.

export class UnsupportedByProvider extends Error {
  constructor(what: string) {
    super(
      `${what} is not available with PayMongo: card details never reach this server, so there is nothing to store.`
    );
  }
}

function secretKey(): string {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "PAYMONGO_SECRET_KEY must be set when PAYMENT_PROVIDER is paymongo"
    );
  }
  return key;
}

function webhookSecret(): string {
  const secret = process.env.BILLING_WEBHOOK_SECRET?.trim();
  if (!secret) {
    throw new Error(
      "BILLING_WEBHOOK_SECRET must be set when PAYMENT_PROVIDER is paymongo"
    );
  }
  return secret;
}

export const paymongoProvider: PaymentProvider = {
  id: "paymongo",
  checkout: "hosted",

  // PayMongo needs no customer object for a one-off checkout. The id is only
  // ever handed back to us on Subscription.providerCustomerId, so a synthetic
  // one keeps the column meaningful without inventing a remote resource.
  async createCustomer(input) {
    return { customerId: `local_${input.appUserId}` };
  },

  async createPaymentMethod() {
    throw new UnsupportedByProvider("Saving a card");
  },
  async attachPaymentMethod() {
    throw new UnsupportedByProvider("Attaching a card");
  },
  async detachPaymentMethod() {
    throw new UnsupportedByProvider("Detaching a card");
  },

  async charge(input: ChargeInput): Promise<ChargeResult> {
    if (toCentavos(input.amount.amount) < MIN_CENTAVOS) {
      return {
        status: "failed",
        paymentId: null,
        code: "amount_too_small",
        message: "PayMongo can't process a payment below ₱1.00.",
        raw: { amount: input.amount },
      };
    }

    try {
      const session = await createCheckoutSession(secretKey(), {
        amountPesos: input.amount.amount,
        description: input.description,
        // Our Payment.id, so a row in PayMongo's dashboard is traceable back
        // to a subscription period without asking us.
        referenceNumber: input.idempotencyKey,
        // ABSOLUTE now: the browser leaves the site for PayMongo's page, and a
        // relative return URL wouldn't survive the trip.
        returnUrl: input.returnUrl.startsWith("http")
          ? input.returnUrl
          : appUrl(input.returnUrl),
        metadata: input.metadata,
      });

      if (!session.attributes.checkout_url) {
        return {
          status: "failed",
          paymentId: session.id,
          code: "no_checkout_url",
          message: "PayMongo didn't return a checkout page. Please try again.",
          raw: session.attributes,
        };
      }

      // Always requires_action: a hosted checkout is a redirect by definition.
      return {
        status: "requires_action",
        paymentId: session.id,
        redirectUrl: session.attributes.checkout_url,
        clientKey: session.attributes.client_key ?? null,
        raw: session.attributes,
      };
    } catch (error) {
      if (error instanceof PayMongoRequestError) {
        return {
          status: "failed",
          paymentId: null,
          code: error.code,
          message: error.message,
          raw: { code: error.code, status: error.status },
        };
      }
      throw error;
    }
  },

  async getCharge(providerPaymentId: string): Promise<ChargeResult> {
    try {
      const session = await getCheckoutSession(secretKey(), providerPaymentId);
      const paid = paidPayment(session);

      if (paid?.id) {
        return {
          status: "succeeded",
          paymentId: providerPaymentId,
          // The pay_… id, which is what a refund needs.
          reference: paid.id,
          raw: session,
        };
      }
      if (session.status === "expired") {
        return {
          status: "failed",
          paymentId: providerPaymentId,
          code: "session_expired",
          message: "The payment page expired before it was completed.",
          raw: session,
        };
      }
      return {
        status: "pending",
        paymentId: providerPaymentId,
        reference: null,
        raw: session,
      };
    } catch (error) {
      if (error instanceof PayMongoRequestError) {
        // Never guess: "pending" keeps the row settleable by the webhook
        // rather than failing a payment that may well have succeeded.
        return {
          status: "pending",
          paymentId: providerPaymentId,
          reference: null,
          raw: { code: error.code, status: error.status },
        };
      }
      throw error;
    }
  },

  async refund(
    providerPaymentId: string,
    amount?: Money,
    reason?: string
  ): Promise<RefundResult> {
    if (!amount) {
      return {
        status: "failed",
        code: "amount_required",
        message: "PayMongo needs the amount to refund.",
        raw: { providerPaymentId },
      };
    }

    try {
      const paymentId = await resolvePaymentId(secretKey(), providerPaymentId);
      if (!paymentId) {
        return {
          status: "failed",
          code: "no_payment",
          message: "PayMongo has no completed payment for that charge.",
          raw: { providerPaymentId },
        };
      }

      const refund = await createRefund(
        secretKey(),
        paymentId,
        amount.amount,
        reason
      );
      return {
        status: refund.status === "succeeded" ? "succeeded" : "pending",
        refundId: refund.id,
        amount: { amount: amount.amount, currency: "PHP" },
        raw: refund,
      };
    } catch (error) {
      if (error instanceof PayMongoRequestError) {
        return {
          status: "failed",
          code: error.code,
          message: error.message,
          raw: { code: error.code, status: error.status },
        };
      }
      throw error;
    }
  },

  async verifyWebhook(
    rawBody: string,
    headers: Headers
  ): Promise<ProviderWebhookEvent | null> {
    const ok = verifyPaymongoSignature(
      webhookSecret(),
      rawBody,
      headers.get("paymongo-signature"),
      Math.floor(Date.now() / 1000)
    );
    if (!ok) return null;

    const event = parsePaymongoEvent(rawBody);
    if (!event) return null;

    if (event.type === "checkout_session.payment.paid") {
      const session = event.attributes as {
        payments?: { id?: string; attributes?: { status?: string } }[];
      };
      return {
        eventId: event.eventId,
        // The SESSION id — what charge() returned and what the Payment row is
        // keyed on.
        providerPaymentId: event.resourceId,
        type: "payment.succeeded",
        reference: paidPayment(session)?.id ?? null,
        failureCode: null,
        failureMessage: null,
        raw: JSON.parse(rawBody),
      };
    }

    if (event.type === "payment.failed" || event.type === "payment.refunded") {
      const payment = event.attributes as {
        last_payment_error?: string;
        checkout_session_id?: string;
      };
      // Without a session id we can't match it to a Payment row, and guessing
      // would risk touching the wrong one.
      if (!payment.checkout_session_id) return null;

      return {
        eventId: event.eventId,
        providerPaymentId: payment.checkout_session_id,
        type:
          event.type === "payment.failed"
            ? "payment.failed"
            : "payment.refunded",
        reference: event.resourceId,
        failureCode: event.type === "payment.failed" ? "payment_failed" : null,
        failureMessage:
          event.type === "payment.failed"
            ? (payment.last_payment_error ?? "The payment was not completed.")
            : null,
        raw: JSON.parse(rawBody),
      };
    }

    return null;
  },
};
