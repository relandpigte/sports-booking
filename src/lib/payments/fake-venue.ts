import "server-only";

import crypto from "node:crypto";

import { cardBrand, cardOutcome, luhnOk } from "./fake";
import type { ChargeResult, Money, ProviderWebhookEvent, RefundResult } from "./types";
import type {
  GatewayCredentials,
  VenueChargeInput,
  VenueGateway,
} from "./partner-types";

// A stand-in for a partner's own gateway. It moves no money and talks to
// nothing, but it exercises every leg of the real flow: credential
// verification that can fail, a charge that can decline or need a redirect,
// the return-leg poll, refunds, and HMAC-verified webhooks.
//
// Card outcomes come from the SAME table as the platform stub (see
// cardOutcome), so a test card behaves identically everywhere:
//   ...4242 succeeds · ...0002 declined · ...0003 insufficient · ...0001 3DS

// Module-level, not per-closure, so getCharge survives across requests within
// a dev process. The durable truth is always the BookingPayment row.
const charges = new Map<string, ChargeResult>();

function id(prefix: string): string {
  return `fake_${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

// Exported so the local stub checkout can post a VALID signature to the real
// webhook route — the payment genuinely completes through that path.
export function signVenueWebhookBody(
  webhookSecret: string,
  rawBody: string
): string {
  return crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest("hex");
}

export function fakeVenueGateway(creds: GatewayCredentials): VenueGateway {
  return {
    id: "fake",
    checkout: "inline",

    async verifyCredentials() {
      // Genuinely failable, so "Connect" means something.
      if (!/^pk_(test|live)_[A-Za-z0-9]{4,}$/.test(creds.publicKey)) {
        return {
          ok: false,
          message: "That doesn't look like a publishable key (pk_test_…).",
        };
      }
      if (!/^sk_(test|live)_[A-Za-z0-9]{8,}$/.test(creds.secretKey)) {
        return {
          ok: false,
          message: "That doesn't look like a secret key (sk_test_…).",
        };
      }
      if (creds.webhookSecret.length < 16) {
        return {
          ok: false,
          message: "The webhook signing secret looks too short.",
        };
      }
      return {
        ok: true,
        accountLabel: creds.secretKey.startsWith("sk_live_")
          ? "Simulated account (live mode)"
          : "Simulated account (test mode)",
      };
    },

    async charge(input: VenueChargeInput): Promise<ChargeResult> {
      const paymentId = id("pi");

      // This stub is an INLINE gateway, so a source is always supplied. The
      // type allows it to be absent for hosted gateways only.
      const source = input.source;
      if (!source) {
        return {
          status: "failed",
          paymentId,
          code: "no_source",
          message: "Choose how you'd like to pay.",
          raw: { simulated: true },
        };
      }

      // Wallets ALWAYS need the payer to approve — the same promise the
      // platform stub makes. GCash and Maya are never a silent charge.
      if (source.kind === "wallet") {
        const result: ChargeResult = {
          status: "requires_action",
          paymentId,
          redirectUrl: input.returnUrl,
          clientKey: id("key"),
          raw: { simulated: true, method: source.type },
        };
        charges.set(paymentId, result);
        return result;
      }

      const pan = source.card.number.replace(/\D/g, "");
      if (pan.length < 13 || pan.length > 19 || !luhnOk(pan)) {
        return {
          status: "failed",
          paymentId,
          code: "invalid_number",
          message: "Enter a valid card number.",
          raw: { simulated: true },
        };
      }

      const now = new Date();
      const expired =
        source.card.expYear < now.getUTCFullYear() ||
        (source.card.expYear === now.getUTCFullYear() &&
          source.card.expMonth < now.getUTCMonth() + 1);
      if (expired) {
        return {
          status: "failed",
          paymentId,
          code: "expired_card",
          message: "That card has expired.",
          raw: { simulated: true },
        };
      }

      const outcome = cardOutcome(pan.slice(-4));
      // The PAN and CVC stop here — nothing below this line sees them.

      if (outcome === "declined" || outcome === "funds") {
        return {
          status: "failed",
          paymentId,
          code: outcome === "declined" ? "card_declined" : "insufficient_funds",
          message:
            outcome === "declined"
              ? "The card was declined."
              : "The card had insufficient funds.",
          raw: { simulated: true, brand: cardBrand(pan) },
        };
      }

      if (outcome === "3ds") {
        const result: ChargeResult = {
          status: "requires_action",
          paymentId,
          redirectUrl: input.returnUrl,
          clientKey: id("key"),
          raw: { simulated: true, reason: "3ds" },
        };
        charges.set(paymentId, result);
        // Resolved by the follow-up poll on the return leg.
        charges.set(`${paymentId}:next`, {
          status: "succeeded",
          paymentId,
          reference: id("ref"),
          raw: { simulated: true },
        });
        return result;
      }

      const result: ChargeResult = {
        status: "succeeded",
        paymentId,
        reference: id("ref"),
        raw: { simulated: true, brand: cardBrand(pan) },
      };
      charges.set(paymentId, result);
      return result;
    },

    async getCharge(providerPaymentId: string): Promise<ChargeResult> {
      const next = charges.get(`${providerPaymentId}:next`);
      if (next) {
        charges.set(providerPaymentId, next);
        charges.delete(`${providerPaymentId}:next`);
        return next;
      }
      return (
        charges.get(providerPaymentId) ?? {
          status: "pending",
          paymentId: providerPaymentId,
          reference: null,
          raw: { simulated: true, note: "unknown to this instance" },
        }
      );
    },

    async refund(
      providerPaymentId: string,
      amount: Money,
      reason?: string
    ): Promise<RefundResult> {
      return {
        status: "succeeded",
        refundId: id("re"),
        amount,
        raw: { simulated: true, providerPaymentId, reason: reason ?? null },
      };
    },

    async verifyWebhook(
      rawBody: string,
      headers: Headers
    ): Promise<ProviderWebhookEvent | null> {
      const provided = headers.get("x-venue-signature") ?? "";
      const expected = signVenueWebhookBody(creds.webhookSecret, rawBody);

      const a = Buffer.from(provided, "utf8");
      const b = Buffer.from(expected, "utf8");
      // timingSafeEqual throws on a length mismatch, so check that first.
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

      try {
        const body = JSON.parse(rawBody) as {
          eventId?: string;
          type?: string;
          providerPaymentId?: string;
          reference?: string | null;
          failureCode?: string | null;
          failureMessage?: string | null;
        };
        if (
          !body.eventId ||
          !body.providerPaymentId ||
          (body.type !== "payment.succeeded" &&
            body.type !== "payment.failed" &&
            body.type !== "payment.refunded")
        ) {
          return null;
        }
        return {
          eventId: body.eventId,
          type: body.type,
          providerPaymentId: body.providerPaymentId,
          reference: body.reference ?? null,
          failureCode: body.failureCode ?? null,
          failureMessage: body.failureMessage ?? null,
          raw: body,
        };
      } catch {
        return null;
      }
    },
  };
}
