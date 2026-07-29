import type {
  ChargeResult,
  Money,
  ProviderWebhookEvent,
  RefundResult,
} from "./types";

// The seam for a PARTNER's own gateway — players paying venues.
//
// Deliberately separate from PaymentProvider (platform subscriptions), for
// three reasons:
//
//   1. PaymentProvider is a singleton that reads process.env at call time.
//      Per-partner credentials would force it to become a factory, breaking
//      every existing call site in billing.ts that has no partner to pass.
//   2. Players never save a card — they pay once, per booking. createCustomer,
//      attachPaymentMethod and detachPaymentMethod would be three dead methods
//      out of eight, and an interface where 40% is unreachable documents worse
//      than two honest ones.
//   3. verifyWebhook has an incompatible source of truth: the platform's env
//      secret vs THIS partner's decrypted secret. Same name, different
//      contract — exactly where sharing an interface breeds a bug.
//
// What IS shared, and imported above: Money, ChargeResult, RefundResult and
// ProviderWebhookEvent. Those are result shapes dictated by how gateways
// actually behave, and they're already right.

export type VenueGatewayId = "fake" | "paymongo";

// Decrypted, in-memory only. Never persisted in this shape, never returned
// from the DAL to a component, never put in an error message.
export type GatewayCredentials = {
  provider: VenueGatewayId;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
};

export type VenueChargeSource =
  | {
      kind: "card";
      card: {
        number: string;
        expMonth: number;
        expYear: number;
        cvc: string;
        name: string;
      };
    }
  | { kind: "wallet"; type: "GCASH" | "MAYA" };

export type VenueChargeInput = {
  amount: Money;
  // INLINE gateways only. A hosted gateway owns the payment form, so the payer
  // chooses their method on the gateway's own page and there is nothing for us
  // to pass — see VenueGateway.checkout.
  source?: VenueChargeSource;
  // e.g. "Court 1 — 30 Jul, 6:00 PM – 8:00 PM"
  description: string;
  // `${paymentId}:${attempt}` — also sent as the gateway's idempotency header.
  idempotencyKey: string;
  // ABSOLUTE: the browser leaves the site for a wallet approval.
  returnUrl: string;
  metadata: Record<string, string>;
};

export interface VenueGateway {
  readonly id: VenueGatewayId;

  // Where the payment form lives.
  //
  //   "hosted" — the gateway's own page. We never see a card number, the payer
  //              picks their method there, and charge() ignores `source`.
  //   "inline" — our form, our fields, our problem.
  //
  // The UI reads this to decide whether to render card inputs at all, so it is
  // a property of the seam rather than a detail of one implementation.
  readonly checkout: "hosted" | "inline";

  // Called when the partner connects, so a typo'd key fails the form rather
  // than silently failing a player's first payment. This is what makes
  // "connect" a real step instead of a text box.
  verifyCredentials(): Promise<
    { ok: true; accountLabel: string | null } | { ok: false; message: string }
  >;

  charge(input: VenueChargeInput): Promise<ChargeResult>;
  // The return leg: finish a redirect flow when the browser comes back before
  // (or instead of) the webhook.
  getCharge(providerPaymentId: string): Promise<ChargeResult>;
  refund(
    providerPaymentId: string,
    amount: Money,
    reason?: string
  ): Promise<RefundResult>;

  // Verified against THIS partner's webhook secret. Raw body — byte-exact.
  verifyWebhook(
    rawBody: string,
    headers: Headers
  ): Promise<ProviderWebhookEvent | null>;
}
