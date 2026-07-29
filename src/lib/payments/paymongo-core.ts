import "server-only";

import crypto from "node:crypto";

// The PayMongo API itself, with no opinion about whose account it is.
//
// Two things use this: the PLATFORM's own account (partners paying Bunal.ph)
// and each PARTNER's account (players paying that venue). Same endpoints, same
// signature scheme, different keys — so the HTTP, the checkout session, the
// refund and the signature verification all live here once, and the two
// adapters above are thin.

const API = "https://api.paymongo.com/v1";

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
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        // Basic auth with the secret key as the username and no password —
        // hence the trailing colon.
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
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
    status?: string;
    source?: { type?: string };
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
): "CARD" | "GCASH" | "MAYA" | undefined {
  if (source === "card") return "CARD";
  if (source === "gcash") return "GCASH";
  if (source === "paymaya") return "MAYA";
  return undefined;
}

// The paid payment inside a session, if there is one. PayMongo lists every
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
  }
): Promise<{ id: string; attributes: CheckoutSession }> {
  const data = await paymongoRequest(secretKey, "POST", "/checkout_sessions", {
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
        payment_method_types: ["card", "gcash", "paymaya"],
        description: input.description,
        // Our own id, so a payment in the PayMongo dashboard can be traced
        // back without asking us.
        reference_number: input.referenceNumber,
        metadata: input.metadata,
        success_url: input.returnUrl,
        cancel_url: input.returnUrl,
        send_email_receipt: false,
      },
    },
  });
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

// A refund needs the pay_… id, but what we store is the cs_… session id.
// Resolving here means no caller has to know the difference.
export async function resolvePaymentId(
  secretKey: string,
  id: string
): Promise<string | null> {
  if (id.startsWith("pay_")) return id;
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

export const WEBHOOK_EVENTS = [
  // The one that settles. A hosted checkout reports completion against the
  // SESSION, not the payment, so this is the event carrying the id we stored.
  "checkout_session.payment.paid",
  "payment.failed",
  "payment.refunded",
];

type WebhookResource = {
  id: string;
  attributes: { url?: string; secret_key?: string; status?: string };
};

// Registers a callback URL in a PayMongo account. The secret is only ever
// returned at creation, so an existing webhook we can't read the secret of is
// useless to us — hence the explicit message rather than a silent reuse.
export async function registerPaymongoWebhook(
  secretKey: string,
  url: string
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
    if (match?.attributes.secret_key) {
      return { ok: true, secret: match.attributes.secret_key };
    }
    if (match) {
      return {
        ok: false,
        message:
          "A webhook for this URL already exists in your PayMongo account, but its signing secret can only be read once. Delete it there, or paste the secret below.",
      };
    }

    const created = await paymongoRequest<WebhookResource>(
      secretKey,
      "POST",
      "/webhooks",
      { data: { attributes: { url, events: WEBHOOK_EVENTS } } }
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
