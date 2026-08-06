import "server-only";

import type {
  ChargeResult,
  Money,
  ProviderWebhookEvent,
  RefundResult,
} from "./types";
import type {
  GatewayCredentials,
  VenueChargeInput,
  VenueGateway,
} from "./partner-types";
import {
  MIN_CENTAVOS,
  PayMongoRequestError,
  createCheckoutSession,
  createRefund,
  getCheckoutSession,
  keyMode,
  methodTypeOf,
  paidPayment,
  parsePaymongoEvent,
  paymongoRequest,
  resolvePaymentId,
  toCentavos,
  verifyPaymongoSignature,
} from "./paymongo-core";

// PayMongo, using each partner's own account. The checkout subtotal lands in
// that account, and the partner remits Bunal.club's accrued service fee later.
// and this app never touches it.
//
// Hosted Checkout Sessions rather than collecting payment details ourselves.
// PayMongo displays the QR Ph payment step, the player leaves the site only
// when continuing on the same device, and the return URL brings them back.
//
// The reusable PayMongo HTTP and signature helpers live in paymongo-core.

// Re-exported so existing importers (and the connect action) don't have to
// know the code moved.
export {
  registerPaymongoWebhook,
  signPaymongoBody,
} from "./paymongo-core";

export function paymongoVenueGateway(creds: GatewayCredentials): VenueGateway {
  const secretKey = creds.secretKey;

  return {
    id: "paymongo",

    async verifyCredentials() {
      // Shape first, because it costs nothing and catches the mistakes people
      // actually make: pasting the same key twice, or one key from each mode.
      const publicMode = keyMode(creds.publicKey);
      const secretMode = keyMode(secretKey);

      if (!creds.publicKey.startsWith("pk_") || !publicMode) {
        return {
          ok: false,
          message:
            "That doesn't look like a PayMongo publishable key (pk_test_… or pk_live_…).",
        };
      }
      if (!secretKey.startsWith("sk_") || !secretMode) {
        return {
          ok: false,
          message:
            "That doesn't look like a PayMongo secret key (sk_test_… or sk_live_…).",
        };
      }
      if (publicMode !== secretMode) {
        return {
          ok: false,
          // The classic silent failure: everything connects, then nothing works.
          message: `Those keys are from different modes — the publishable key is ${publicMode} and the secret key is ${secretMode}. Use both from the same one.`,
        };
      }

      try {
        // A cheap authenticated call. 401 here means the key is wrong, which is
        // exactly what we want to find out before storing it.
        await paymongoRequest(secretKey, "GET", "/webhooks");
      } catch (error) {
        if (error instanceof PayMongoRequestError) {
          return {
            ok: false,
            message:
              error.status === 401
                ? "PayMongo rejected that secret key."
                : error.message,
          };
        }
        throw error;
      }

      return { ok: true, accountLabel: `PayMongo (${secretMode} mode)` };
    },

    async charge(input: VenueChargeInput): Promise<ChargeResult> {
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
        const session = await createCheckoutSession(secretKey, {
          amountPesos: input.amount.amount,
          description: input.description,
          referenceNumber: input.metadata.paymentId ?? input.idempotencyKey,
          returnUrl: input.returnUrl,
          metadata: input.metadata,
          paymentMethodTypes: ["qrph"],
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

        // Always requires_action: a hosted checkout is a redirect by
        // definition. The booking stays PENDING and its hold keeps running
        // until the webhook or the return-leg poll says otherwise.
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
        const session = await getCheckoutSession(secretKey, providerPaymentId);
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
        // Still open — the player hasn't finished, or is mid-redirect.
        return {
          status: "pending",
          paymentId: providerPaymentId,
          reference: null,
          raw: session,
        };
      } catch (error) {
        if (error instanceof PayMongoRequestError) {
          // Never guess. "Pending" keeps the row settleable by the webhook
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
      amount: Money,
      reason?: string
    ): Promise<RefundResult> {
      try {
        const paymentId = await resolvePaymentId(secretKey, providerPaymentId);
        if (!paymentId) {
          return {
            status: "failed",
            code: "no_payment",
            message: "PayMongo has no completed payment for that booking.",
            raw: { providerPaymentId },
          };
        }

        const refund = await createRefund(
          secretKey,
          paymentId,
          amount.amount,
          reason
        );
        return {
          // A PayMongo refund can settle asynchronously for e-wallets; either
          // way the money is committed, and our ledger records it once.
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
        creds.webhookSecret,
        rawBody,
        headers.get("paymongo-signature"),
        Math.floor(Date.now() / 1000)
      );
      if (!ok) return null;

      const event = parsePaymongoEvent(rawBody);
      if (!event) return null;

      if (event.type === "checkout_session.payment.paid") {
        const session = event.attributes as {
          payments?: { id?: string; attributes?: { status?: string; source?: { type?: string } } }[];
          payment_method_used?: string | null;
        };
        const paid = paidPayment(session);
        return {
          eventId: event.eventId,
          // The SESSION id: that's what charge() handed back and what the
          // BookingPayment row is keyed on.
          providerPaymentId: event.resourceId,
          type: "payment.succeeded",
          reference: paid?.id ?? null,
          failureCode: null,
          failureMessage: null,
          methodType: methodTypeOf(
            paid?.attributes?.source?.type ?? session.payment_method_used
          ),
          raw: JSON.parse(rawBody),
        };
      }

      if (event.type === "payment.failed" || event.type === "payment.refunded") {
        const payment = event.attributes as {
          last_payment_error?: string;
          source?: { type?: string };
          // Present on a payment created through a checkout session.
          checkout_session_id?: string;
        };
        // Without a session id we can't match it to a BookingPayment row, and
        // guessing would risk touching the wrong one.
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
          methodType: methodTypeOf(payment.source?.type),
          raw: JSON.parse(rawBody),
        };
      }

      // An event we didn't subscribe to. Not an error — just nothing to do.
      return null;
    },
  };
}
