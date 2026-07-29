// The seam between this app and a payment gateway.
//
// The shape here is dictated by what a REAL gateway forces on you — a customer
// object to hang saved methods off, tokenize/attach/detach for card-on-file, a
// charge that can come back succeeded / requires_action (3DS or an e-wallet
// redirect) / pending, a poll for the return leg, a refund, and byte-exact
// webhook verification. Another gateway is one new file implementing this
// interface plus one case in the registry.
//
// PayMongo is hosted, which makes three of these methods unimplementable:
// card details never reach this server, so there is nothing to tokenize,
// attach or detach. They throw rather than lying about it — see
// UnsupportedByProvider — and every caller is behind a `checkout === "inline"`
// branch that is currently unreachable. An inline gateway would light it up
// again; the alternative was deleting the concept of card-on-file outright.

export type ProviderId = "paymongo";

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
  // How they actually paid, when the gateway tells us. Only a hosted checkout
  // knows this — the payer chose it there — so it's optional and the platform
  // provider never sets it.
  methodType?: "CARD" | "GCASH" | "MAYA";
  raw: unknown;
};

export interface PaymentProvider {
  readonly id: ProviderId;

  // Where the payment form lives — the same distinction VenueGateway draws.
  //
  //   "hosted" — the gateway's own page. We never see a card number, which
  //              also means we can never SAVE one: createPaymentMethod and
  //              friends throw, and nothing auto-renews.
  //   "inline" — our form, our fields, our problem.
  //
  // The UI reads this to decide whether to ask for card details at all.
  readonly checkout: "hosted" | "inline";

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
