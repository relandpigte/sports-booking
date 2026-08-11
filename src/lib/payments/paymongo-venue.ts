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
  createQrPhPaymentIntent,
  createRefund,
  getCheckoutSession,
  getPaymentIntent,
  keyMode,
  methodTypeOf,
  paidPayment,
  parsePaymongoEvent,
  paymentIntentError,
  paymentIntentQrExpired,
  paymongoRequest,
  resolvePaymentId,
  toCentavos,
  verifyPaymongoSignature,
} from "./paymongo-core";

// PayMongo, using each partner's own account. The checkout subtotal lands in
// that account, and the partner remits Bunal.club's accrued service fee later.
// and this app never touches it.
//
// Direct Payment Intents return PayMongo's signed QR image for Bunal.club to
// display. Existing hosted Checkout Sessions remain readable during rollout.
//
// The reusable PayMongo HTTP and signature helpers live in paymongo-core.

// Re-exported so existing importers (and the connect action) don't have to
// know the code moved.
export {
  PAYMONGO_WEBHOOK_VERSION,
  VENUE_WEBHOOK_EVENTS,
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
        const intent = await createQrPhPaymentIntent(secretKey, {
          amountPesos: input.amount.amount,
          description: input.description,
          metadata: input.metadata,
          expiresInSeconds: input.expiresInSeconds,
          idempotencyKey: input.idempotencyKey,
        });

        const paid = paidPayment(intent.attributes);
        if (intent.attributes.status === "succeeded" && paid?.id) {
          return {
            status: "succeeded",
            paymentId: intent.id,
            reference: paid.id,
            raw: intent.attributes,
          };
        }

        const qrImageUrl = intent.attributes.next_action?.code?.image_url;
        if (!qrImageUrl?.startsWith("data:image/")) {
          return {
            status: "failed",
            paymentId: intent.id,
            code: "no_qr_image",
            message: "PayMongo didn't return a QR Ph code. Please try again.",
            raw: intent.attributes,
          };
        }

        // The booking stays PENDING and its hold keeps running until the
        // signed webhook or status poll says the exact-amount QR was paid.
        return {
          status: "requires_action",
          paymentId: intent.id,
          redirectUrl: null,
          qrImageUrl,
          clientKey: intent.attributes.client_key ?? null,
          raw: intent.attributes,
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
        if (providerPaymentId.startsWith("pi_")) {
          const intent = await getPaymentIntent(secretKey, providerPaymentId);
          const paid = paidPayment(intent);
          if (intent.status === "succeeded" && paid?.id) {
            return {
              status: "succeeded",
              paymentId: providerPaymentId,
              reference: paid.id,
              raw: intent,
            };
          }

          const failure = paymentIntentError(intent);
          if (
            failure ||
            intent.status === "awaiting_payment_method" ||
            paymentIntentQrExpired(intent)
          ) {
            return {
              status: "failed",
              paymentId: providerPaymentId,
              code: failure?.code ?? "qr_expired",
              message:
                failure?.message ??
                "The QR Ph code expired before payment was completed.",
              raw: intent,
            };
          }

          return {
            status: "pending",
            paymentId: providerPaymentId,
            reference: null,
            raw: intent,
          };
        }

        // Backward compatibility for QR-only hosted sessions created before
        // direct Payment Intents were deployed.
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
          amountCentavos: paid?.attributes?.amount,
          raw: JSON.parse(rawBody),
        };
      }

      if (event.type === "payment.paid") {
        const payment = event.attributes as {
          amount?: number;
          payment_intent_id?: string;
          source?: { type?: string };
        };
        if (!payment.payment_intent_id) return null;
        return {
          eventId: event.eventId,
          providerPaymentId: payment.payment_intent_id,
          type: "payment.succeeded",
          reference: event.resourceId,
          failureCode: null,
          failureMessage: null,
          amountCentavos: payment.amount,
          methodType: methodTypeOf(payment.source?.type),
          raw: JSON.parse(rawBody),
        };
      }

      if (event.type === "payment.failed" || event.type === "payment.refunded") {
        const payment = event.attributes as {
          amount?: number;
          last_payment_error?: string;
          source?: { type?: string };
          // Present on a payment created through a checkout session.
          checkout_session_id?: string;
          // Present on a payment created through a direct Payment Intent.
          payment_intent_id?: string;
        };
        const providerPaymentId =
          payment.payment_intent_id ?? payment.checkout_session_id;
        if (!providerPaymentId) return null;

        return {
          eventId: event.eventId,
          providerPaymentId,
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
          amountCentavos: payment.amount,
          raw: JSON.parse(rawBody),
        };
      }

      // An event we didn't subscribe to. Not an error — just nothing to do.
      return null;
    },
  };
}
