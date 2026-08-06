import type {
  ChargeResult,
  Money,
  ProviderWebhookEvent,
  RefundResult,
} from "./types";

// The seam for a partner's own gateway. Players pay once per booking; QR Ph
// payment details stay on the provider's hosted checkout.

export type VenueGatewayId = "paymongo";

// Decrypted, in-memory only. Never persisted in this shape, never returned
// from the DAL to a component, never put in an error message.
export type GatewayCredentials = {
  provider: VenueGatewayId;
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
};

// No payment source: PayMongo hosts the QR Ph checkout, so no payer details
// appear anywhere in this file or reach this server.
export type VenueChargeInput = {
  amount: Money;
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
