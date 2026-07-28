// The seam between this app and a payment gateway.
//
// The shape here is dictated by what a REAL gateway forces on you — a customer
// object to hang saved methods off, tokenize/attach/detach for card-on-file, a
// charge that can come back succeeded / requires_action (3DS or an e-wallet
// redirect) / pending, a poll for the return leg, a refund, and byte-exact
// webhook verification. None of it is shaped around the fake implementation, so
// dropping in PayMongo later is one new file plus one case in the registry.
//
// NOTE for that swap: with a real gateway, card data must be tokenized in the
// BROWSER (e.g. PayMongo.js) so the PAN never reaches this server. The interface
// already supports that — `createPaymentMethod` returns a ProviderMethod and
// `charge` accepts `{ kind: "saved", methodId }` — so only the fake's
// card-object branch goes away.

export type ProviderId = "fake" | "paymongo";

export type Money = { amount: number; currency: "PHP" };

export type CustomerInput = {
  appUserId: string;
  email: string;
  name: string | null;
  phone: string | null;
};

export type NewPaymentMethod =
  | {
      type: "CARD";
      card: {
        number: string;
        expMonth: number;
        expYear: number;
        cvc: string;
        name: string;
      };
    }
  | { type: "GCASH" }
  | { type: "MAYA" };

// What we are allowed to persist. Never contains a card number or CVC.
export type ProviderMethod = {
  methodId: string;
  type: "CARD" | "GCASH" | "MAYA";
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
};

export type ChargeSource =
  | { kind: "saved"; methodId: string }
  | { kind: "new"; method: NewPaymentMethod };

export type ChargeInput = {
  customerId: string | null;
  amount: Money;
  source: ChargeSource;
  description: string;
  // Passed to the gateway's own idempotency header as well as being our guard.
  idempotencyKey: string;
  // Where the browser lands after an e-wallet redirect.
  returnUrl: string;
  metadata: Record<string, string>;
};

export type ChargeResult =
  | {
      status: "succeeded";
      paymentId: string;
      reference: string | null;
      raw: unknown;
    }
  | {
      status: "requires_action";
      paymentId: string;
      redirectUrl: string;
      clientKey: string | null;
      raw: unknown;
    }
  | {
      status: "pending";
      paymentId: string;
      reference: string | null;
      raw: unknown;
    }
  | {
      status: "failed";
      paymentId: string | null;
      code: string;
      message: string;
      raw: unknown;
    };

export type RefundResult =
  | {
      status: "succeeded" | "pending";
      refundId: string;
      amount: Money;
      raw: unknown;
    }
  | { status: "failed"; code: string; message: string; raw: unknown };

export type ProviderWebhookEvent = {
  eventId: string;
  type: "payment.succeeded" | "payment.failed" | "payment.refunded";
  providerPaymentId: string;
  reference: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  raw: unknown;
};

export interface PaymentProvider {
  readonly id: ProviderId;

  // --- customers -----------------------------------------------------------
  createCustomer(input: CustomerInput): Promise<{ customerId: string }>;

  // --- payment methods -----------------------------------------------------
  // Tokenize/validate BEFORE an account exists, so a declined card fails the
  // registration form instead of orphaning a half-built partner.
  createPaymentMethod(input: NewPaymentMethod): Promise<ProviderMethod>;
  attachPaymentMethod(customerId: string, methodId: string): Promise<void>;
  detachPaymentMethod(customerId: string, methodId: string): Promise<void>;

  // --- money ---------------------------------------------------------------
  charge(input: ChargeInput): Promise<ChargeResult>;
  // Finish a redirect flow when the browser returns before (or instead of) the
  // webhook.
  getCharge(providerPaymentId: string): Promise<ChargeResult>;
  refund(
    providerPaymentId: string,
    amount?: Money,
    reason?: string
  ): Promise<RefundResult>;

  // --- webhooks ------------------------------------------------------------
  // Returns null on a bad or absent signature. Takes the RAW body string:
  // signature verification is byte-exact, so the route must not parse first.
  verifyWebhook(
    rawBody: string,
    headers: Headers
  ): Promise<ProviderWebhookEvent | null>;
}
