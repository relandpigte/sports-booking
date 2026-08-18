import "server-only";

import crypto from "node:crypto";

// The PayMongo API itself, with no opinion about whose account it is.
//
// Two things use this: the PLATFORM's own account (partners paying Bunal.club)
// and each PARTNER's account (players paying that venue). Same endpoints, same
// signature scheme, different keys — so the HTTP, the checkout session, the
// refund and the signature verification all live here once, and the two
// adapters above are thin.

const API = "https://api.paymongo.com";

// PayMongo works in centavos. Everything above this line is pesos, so this is
// the ONLY place the two meet.
export const toCentavos = (pesos: number) => Math.round(pesos * 100);
export const toPesos = (centavos: number) => centavos / 100;

// PayMongo rejects anything below ₱1.00.
export const MIN_CENTAVOS = 100;

export type PayMongoResource = {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
};

export class PayMongoRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type PayMongoError = { code?: string; detail?: string };

export async function paymongoRequest<T = PayMongoResource>(
  secretKey: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  options: {
    version?: "v1" | "v2";
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}/${options.version ?? "v1"}${path}`, {
      method,
      headers: {
        // Basic auth with the secret key as the username and no password —
        // hence the trailing colon.
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.idempotencyKey
          ? { "Idempotency-Key": options.idempotencyKey }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      // A gateway that hangs must not hang a Server Action holding a court.
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new PayMongoRequestError(
      0,
      "network_error",
      "We couldn't reach PayMongo. Please try again."
    );
  }

  const text = await response.text();
  let parsed: { data?: T; errors?: PayMongoError[] } = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* PayMongo returned something that isn't JSON — handled below. */
  }

  if (!response.ok) {
    const first = parsed.errors?.[0];
    throw new PayMongoRequestError(
      response.status,
      first?.code ?? `http_${response.status}`,
      // PayMongo's `detail` is written for humans, so it's safe to surface.
      first?.detail ?? "PayMongo rejected that request."
    );
  }
  if (!parsed.data) {
    throw new PayMongoRequestError(
      response.status,
      "empty_response",
      "PayMongo returned an unexpected response."
    );
  }
  return parsed.data;
}

// --- keys -------------------------------------------------------------------

export type KeyMode = "test" | "live";

export function keyMode(key: string): KeyMode | null {
  if (/^[ps]k_test_/.test(key)) return "test";
  if (/^[ps]k_live_/.test(key)) return "live";
  return null;
}

// --- checkout sessions ------------------------------------------------------

export type PayMongoPayment = {
  id?: string;
  attributes?: {
    amount?: number;
    status?: string;
    source?: { type?: string };
    payment_intent_id?: string;
  };
};

export type CheckoutSession = {
  status?: string;
  checkout_url?: string;
  client_key?: string;
  payments?: PayMongoPayment[];
  payment_method_used?: string | null;
};

export function methodTypeOf(
  source?: string | null
): "QRPH" | "CARD" | "GCASH" | "MAYA" | undefined {
  if (source === "qrph") return "QRPH";
  if (source === "card") return "CARD";
  if (source === "gcash") return "GCASH";
  if (source === "paymaya") return "MAYA";
  return undefined;
}

// The paid payment inside a session or intent, if there is one. PayMongo lists every
// attempt, so this deliberately looks for a PAID one rather than the first.
export function paidPayment(session: CheckoutSession): PayMongoPayment | null {
  return session.payments?.find((p) => p.attributes?.status === "paid") ?? null;
}

export async function createCheckoutSession(
  secretKey: string,
  input: {
    amountPesos: number;
    description: string;
    referenceNumber: string;
    returnUrl: string;
    metadata: Record<string, string>;
    paymentMethodTypes: ("card" | "gcash" | "paymaya" | "qrph")[];
    passOnFees?: boolean;
    idempotencyKey?: string;
  }
): Promise<{ id: string; attributes: CheckoutSession }> {
  const data = await paymongoRequest(
    secretKey,
    "POST",
    "/checkout_sessions",
    {
      data: {
        attributes: {
          line_items: [
            {
              name: input.description,
              amount: toCentavos(input.amountPesos),
              currency: "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: input.paymentMethodTypes,
          description: input.description,
          // Our own id, so a payment in the PayMongo dashboard can be traced
          // back without asking us.
          reference_number: input.referenceNumber,
          metadata: input.metadata,
          success_url: input.returnUrl,
          cancel_url: input.returnUrl,
          send_email_receipt: false,
          // The hub must receive the complete court amount plus the service fee
          // it later remits. PayMongo adds its method-specific processing fee
          // to the player's checkout total instead of deducting it here.
          pass_on_fees: input.passOnFees ?? true,
        },
      },
    },
    { version: "v2", idempotencyKey: input.idempotencyKey }
  );
  return { id: data.id, attributes: data.attributes as CheckoutSession };
}

export async function getCheckoutSession(
  secretKey: string,
  sessionId: string
): Promise<CheckoutSession> {
  const data = await paymongoRequest(
    secretKey,
    "GET",
    `/checkout_sessions/${sessionId}`
  );
  return data.attributes as CheckoutSession;
}

// --- direct QR Ph Payment Intents ------------------------------------------

export type PaymentIntent = {
  amount?: number;
  status?: string;
  client_key?: string;
  payments?: PayMongoPayment[];
  last_payment_error?:
    | string
    | { code?: string; detail?: string; message?: string }
    | null;
  next_action?: {
    code?: { image_url?: string; expires_at?: string };
  } | null;
};

export function paymentIntentQrExpired(
  intent: PaymentIntent,
  now: Date = new Date()
): boolean {
  const expiresAt = intent.next_action?.code?.expires_at;
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return (
    paidPayment(intent) == null &&
    Number.isFinite(timestamp) &&
    timestamp <= now.getTime()
  );
}

export function paymentIntentError(intent: PaymentIntent): {
  code: string;
  message: string;
} | null {
  const error = intent.last_payment_error;
  if (!error) return null;
  if (typeof error === "string") {
    return { code: "payment_failed", message: error };
  }
  return {
    code: error.code ?? "payment_failed",
    message:
      error.detail ?? error.message ?? "The PayMongo payment was not completed.",
  };
}

export async function createQrPhPaymentIntent(
  secretKey: string,
  input: {
    amountPesos: number;
    description: string;
    metadata: Record<string, string>;
    expiresInSeconds: number;
    idempotencyKey: string;
  }
): Promise<{ id: string; attributes: PaymentIntent }> {
  const intent = await paymongoRequest(
    secretKey,
    "POST",
    "/payment_intents",
    {
      data: {
        attributes: {
          amount: toCentavos(input.amountPesos),
          currency: "PHP",
          payment_method_allowed: ["qrph"],
          description: input.description,
          metadata: input.metadata,
        },
      },
    },
    { idempotencyKey: `${input.idempotencyKey}:intent` }
  );
  const intentAttributes = intent.attributes as PaymentIntent;

  const paymentMethod = await paymongoRequest(
    secretKey,
    "POST",
    "/payment_methods",
    {
      data: {
        attributes: {
          type: "qrph",
          expiry_seconds: Math.max(60, Math.min(9_000, input.expiresInSeconds)),
        },
      },
    },
    { idempotencyKey: `${input.idempotencyKey}:method` }
  );

  const attached = await paymongoRequest(
    secretKey,
    "POST",
    `/payment_intents/${intent.id}/attach`,
    {
      data: {
        attributes: {
          payment_method: paymentMethod.id,
          ...(intentAttributes.client_key
            ? { client_key: intentAttributes.client_key }
            : {}),
        },
      },
    },
    { idempotencyKey: `${input.idempotencyKey}:attach` }
  );

  return { id: attached.id, attributes: attached.attributes as PaymentIntent };
}

export async function getPaymentIntent(
  secretKey: string,
  intentId: string
): Promise<PaymentIntent> {
  const data = await paymongoRequest(
    secretKey,
    "GET",
    `/payment_intents/${intentId}`
  );
  return data.attributes as PaymentIntent;
}

export async function cancelPaymentIntent(
  secretKey: string,
  intentId: string
): Promise<PaymentIntent> {
  const data = await paymongoRequest(
    secretKey,
    "POST",
    `/payment_intents/${intentId}/cancel`
  );
  return data.attributes as PaymentIntent;
}

// A refund needs the pay_… id, but the ledger stores either the current pi_…
// intent id or a legacy cs_… session id.
export async function resolvePaymentId(
  secretKey: string,
  id: string
): Promise<string | null> {
  if (id.startsWith("pay_")) return id;
  if (id.startsWith("pi_")) {
    const intent = await getPaymentIntent(secretKey, id);
    return paidPayment(intent)?.id ?? null;
  }
  const session = await getCheckoutSession(secretKey, id);
  return paidPayment(session)?.id ?? null;
}

export async function createRefund(
  secretKey: string,
  paymentId: string,
  amountPesos: number,
  reason?: string
): Promise<{ id: string; status?: string; amount?: number }> {
  const data = await paymongoRequest(secretKey, "POST", "/refunds", {
    data: {
      attributes: {
        amount: toCentavos(amountPesos),
        payment_id: paymentId,
        // PayMongo's enum. A venue cancellation is the customer asking, as far
        // as the gateway is concerned.
        reason: "requested_by_customer",
        notes: reason?.slice(0, 255),
      },
    },
  });
  const attrs = data.attributes as { status?: string; amount?: number };
  return { id: data.id, status: attrs.status, amount: attrs.amount };
}

// --- webhooks ---------------------------------------------------------------

export const PAYMONGO_WEBHOOK_VERSION = 2;

export const PLATFORM_WEBHOOK_EVENTS = [
  // The one that settles. A hosted checkout reports completion against the
  // SESSION, not the payment, so this is the event carrying the id we stored.
  "checkout_session.payment.paid",
  "payment.failed",
  "payment.refunded",
];

export const VENUE_WEBHOOK_EVENTS = [
  ...PLATFORM_WEBHOOK_EVENTS,
  "payment.paid",
];

type WebhookResource = {
  id: string;
  attributes: {
    url?: string;
    secret_key?: string;
    status?: string;
    events?: string[];
  };
};

// Registers or updates a callback URL in a PayMongo account. Update responses
// may omit the one-time signing secret, so callers upgrading an existing
// connection provide the encrypted secret they already hold.
export async function registerPaymongoWebhook(
  secretKey: string,
  url: string,
  knownSecret?: string,
  events: string[] = PLATFORM_WEBHOOK_EVENTS
): Promise<{ ok: true; secret: string } | { ok: false; message: string }> {
  if (!url.startsWith("https://")) {
    return {
      ok: false,
      message:
        "PayMongo only delivers to public https URLs, and this server is configured with a non-https APP_URL.",
    };
  }

  try {
    // Reuse before creating: PayMongo caps webhooks per account, and
    // reconnecting shouldn't accumulate dead endpoints.
    const existing = await paymongoRequest<WebhookResource[]>(
      secretKey,
      "GET",
      "/webhooks"
    );
    const match = existing.find((w) => w.attributes.url === url);
    if (match) {
      const updated = await paymongoRequest<WebhookResource>(
        secretKey,
        "PUT",
        `/webhooks/${match.id}`,
        { data: { attributes: { url, events } } }
      );
      const secret =
        updated.attributes.secret_key ??
        match.attributes.secret_key ??
        knownSecret;
      if (secret) return { ok: true, secret };
      return {
        ok: false,
        message:
          "The PayMongo webhook events were updated, but its signing secret is not readable. Paste the existing secret below.",
      };
    }

    const created = await paymongoRequest<WebhookResource>(
      secretKey,
      "POST",
      "/webhooks",
      { data: { attributes: { url, events } } }
    );
    const secret = created.attributes.secret_key;
    if (!secret) {
      return {
        ok: false,
        message:
          "PayMongo created the webhook but didn't return a signing secret. Paste it below instead.",
      };
    }
    return { ok: true, secret };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof PayMongoRequestError
          ? error.message
          : "We couldn't set up the webhook with PayMongo.",
    };
  }
}

// Exported for the verification suite: builds the header PayMongo would send.
export function signPaymongoBody(
  webhookSecret: string,
  rawBody: string,
  timestamp: number,
  mode: KeyMode = "test"
): string {
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `t=${timestamp},${mode === "live" ? "li" : "te"}=${signature}`;
}

// How stale a delivery may be before we refuse it. Generous enough for a
// retried delivery, short enough that a captured request can't be replayed
// days later — and ProviderEvent absorbs replays inside the window anyway.
const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export function verifyPaymongoSignature(
  webhookSecret: string,
  rawBody: string,
  header: string | null,
  now: number
): boolean {
  if (!header) return false;

  const parts = new Map<string, string>();
  for (const piece of header.split(",")) {
    const [key, value] = piece.split("=", 2);
    if (key && value) parts.set(key.trim(), value.trim());
  }

  const timestamp = Number(parts.get("t"));
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > MAX_SIGNATURE_AGE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  // Compared against EVERY signature component, not just the one we think
  // matches this account's mode. PayMongo sends `te` for test deliveries and
  // `li` for live ones; checking both means switching from test to live keys
  // can't quietly stop settling, and it stays correct if a third component is
  // ever added.
  for (const [key, value] of parts) {
    if (key === "t") continue;
    const provided = Buffer.from(value, "utf8");
    if (
      provided.length === expectedBuf.length &&
      crypto.timingSafeEqual(provided, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

// The shape both adapters need out of a verified body, before each maps it
// into its own event type.
export type ParsedPaymongoEvent = {
  eventId: string;
  type: string;
  resourceId: string;
  attributes: Record<string, unknown>;
};

export function parsePaymongoEvent(rawBody: string): ParsedPaymongoEvent | null {
  let body: {
    data?: {
      id?: string;
      attributes?: { type?: string; data?: PayMongoResource };
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }

  const eventId = body.data?.id;
  const type = body.data?.attributes?.type;
  const resource = body.data?.attributes?.data;
  if (!eventId || !type || !resource?.id) return null;

  return {
    eventId,
    type,
    resourceId: resource.id,
    attributes: resource.attributes ?? {},
  };
}
