import "server-only";

import crypto from "node:crypto";

import type {
  ChargeInput,
  ChargeResult,
  Money,
  NewPaymentMethod,
  PaymentProvider,
  ProviderMethod,
  ProviderWebhookEvent,
  RefundResult,
} from "./types";

// A stand-in gateway. It takes no money and talks to nothing, but it exercises
// every leg of the real flow: tokenization that can decline, a charge that can
// require a redirect, a return-leg poll, and HMAC-verified webhooks.
//
// Card outcomes are driven by the last four digits so failure is testable with
// no configuration:
//   ...4242 -> succeeds
//   ...0002 -> declined
//   ...0003 -> insufficient funds
//   ...0001 -> requires_action (simulates 3DS), then succeeds on getCharge
//   anything else -> succeeds

export type FakeCardOutcome = "ok" | "declined" | "funds" | "3ds";

const OUTCOME_BY_LAST4: Record<string, FakeCardOutcome> = {
  "4242": "ok",
  "0002": "declined",
  "0003": "funds",
  "0001": "3ds",
};

// Exported so the venue stub uses the SAME table — a test card must behave
// identically whether it's paying the platform or a venue.
export function cardOutcome(last4: string): FakeCardOutcome {
  return OUTCOME_BY_LAST4[last4] ?? "ok";
}

export function luhnOk(pan: string): boolean {
  return luhnValid(pan);
}

export function cardBrand(pan: string): string {
  return brandOf(pan);
}

// Dev-only memory of issued charges so getCharge isn't a lie. The durable truth
// is always the Payment row in the database; this is just the gateway's side.
const charges = new Map<string, ChargeResult>();

function id(prefix: string): string {
  return `fake_${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function luhnValid(pan: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let digit = pan.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function brandOf(pan: string): string {
  if (pan.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(pan) || /^2[2-7]/.test(pan)) return "mastercard";
  if (/^3[47]/.test(pan)) return "amex";
  return "card";
}

export class FakeCardError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function webhookSecret(): string {
  const secret = process.env.BILLING_WEBHOOK_SECRET ?? "";
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("BILLING_WEBHOOK_SECRET must be set in production");
  }
  // Dev fallback keeps the local flow working without extra setup; production
  // has already thrown above.
  return secret || "dev-insecure-webhook-secret";
}

// Exported so the local stub checkout can call the webhook route with a valid
// signature — the payment really does complete through the webhook path.
export function signWebhookBody(rawBody: string): string {
  return crypto
    .createHmac("sha256", webhookSecret())
    .update(rawBody, "utf8")
    .digest("hex");
}

export const fakeProvider: PaymentProvider = {
  id: "fake",

  // The real gateway needs the customer's details; the fake just mints an id.
  async createCustomer() {
    return { customerId: id("cus") };
  },

  async createPaymentMethod(input: NewPaymentMethod): Promise<ProviderMethod> {
    if (input.type !== "CARD") {
      // E-wallets have no stored token — the payer authorizes each charge.
      return {
        methodId: id("pm"),
        type: input.type,
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
      };
    }

    const pan = input.card.number.replace(/\D/g, "");
    if (pan.length < 13 || pan.length > 19 || !luhnValid(pan)) {
      throw new FakeCardError("invalid_number", "Enter a valid card number.");
    }

    const now = new Date();
    const expired =
      input.card.expYear < now.getUTCFullYear() ||
      (input.card.expYear === now.getUTCFullYear() &&
        input.card.expMonth < now.getUTCMonth() + 1);
    if (expired) {
      throw new FakeCardError("expired_card", "That card has expired.");
    }

    const last4 = pan.slice(-4);
    if (OUTCOME_BY_LAST4[last4] === "declined") {
      throw new FakeCardError("card_declined", "Your card was declined.");
    }

    // The PAN and CVC stop here — nothing below this line ever sees them.
    return {
      methodId: `${id("pm")}_${last4}`,
      type: "CARD",
      brand: brandOf(pan),
      last4,
      expMonth: input.card.expMonth,
      expYear: input.card.expYear,
    };
  },

  async attachPaymentMethod() {},
  async detachPaymentMethod() {},

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const paymentId = id("pi");

    const methodType =
      input.source.kind === "new"
        ? input.source.method.type
        : // A saved method is only ever a card in this app.
          "CARD";

    // E-wallets ALWAYS require the payer to approve. That is the whole point:
    // GCash and Maya must visibly never be a silent charge.
    if (methodType === "GCASH" || methodType === "MAYA") {
      const result: ChargeResult = {
        status: "requires_action",
        paymentId,
        redirectUrl: input.returnUrl,
        clientKey: id("key"),
        raw: { simulated: true, method: methodType },
      };
      charges.set(paymentId, result);
      return result;
    }

    // Card: outcome from the token's trailing last4, or the PAN for a new card.
    const last4 =
      input.source.kind === "saved"
        ? (input.source.methodId.split("_").pop() ?? "")
        : input.source.method.type === "CARD"
          ? input.source.method.card.number.replace(/\D/g, "").slice(-4)
          : "";

    const outcome = OUTCOME_BY_LAST4[last4] ?? "ok";

    if (outcome === "declined" || outcome === "funds") {
      return {
        status: "failed",
        paymentId,
        code: outcome === "declined" ? "card_declined" : "insufficient_funds",
        message:
          outcome === "declined"
            ? "The card was declined."
            : "The card had insufficient funds.",
        raw: { simulated: true },
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
      // The follow-up poll resolves it.
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
      raw: { simulated: true },
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
    amount?: Money
  ): Promise<RefundResult> {
    return {
      status: "succeeded",
      refundId: id("re"),
      amount: amount ?? { amount: 0, currency: "PHP" },
      raw: { simulated: true, providerPaymentId },
    };
  },

  async verifyWebhook(
    rawBody: string,
    headers: Headers
  ): Promise<ProviderWebhookEvent | null> {
    const provided = headers.get("x-fake-signature") ?? "";
    const expected = signWebhookBody(rawBody);

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
