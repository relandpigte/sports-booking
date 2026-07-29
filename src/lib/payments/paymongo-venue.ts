import "server-only";

import crypto from "node:crypto";

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

// PayMongo, using each partner's own account — the money goes straight to them
// and this app never touches it.
//
// Hosted Checkout Sessions rather than Payment Intents with our own card form.
// Two reasons, and the first is the one that matters: a card number never
// reaches this server, so the app stays out of PCI scope entirely. The second
// is that PayMongo gates the raw-card API behind a PCI attestation a small
// venue platform has no business obtaining. The cost is that the player leaves
// the site for a moment; the hold keeps running while they're away and the
// return URL brings them straight back.
//
// No SDK: this is four endpoints, and a dependency here would be more surface
// area than the code it replaces.

const API = "https://api.paymongo.com/v1";

// PayMongo works in centavos. Everything above this line is pesos, so this is
// the ONLY place the two meet.
const toCentavos = (pesos: number) => Math.round(pesos * 100);
const toPesos = (centavos: number) => centavos / 100;

// PayMongo rejects anything below ₱1.00.
const MIN_CENTAVOS = 100;

type PayMongoError = { code?: string; detail?: string };
type PayMongoResource = {
  id: string;
  type: string;
  attributes: Record<string, unknown>;
};

class PayMongoRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function authHeader(secretKey: string): string {
  // PayMongo uses HTTP Basic with the secret key as the username and no
  // password — hence the trailing colon.
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

// Every call goes through here. The key is passed per call rather than closed
// over so registerPaymongoWebhook can use it before any gateway exists.
async function request<T = PayMongoResource>(
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
        Authorization: authHeader(secretKey),
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

type KeyMode = "test" | "live";

function keyMode(key: string): KeyMode | null {
  if (/^[ps]k_test_/.test(key)) return "test";
  if (/^[ps]k_live_/.test(key)) return "live";
  return null;
}

// --- webhooks ---------------------------------------------------------------

const WEBHOOK_EVENTS = [
  // The one that settles a booking. A hosted checkout reports completion
  // against the SESSION, not the payment, so this is the event that carries
  // the id we stored.
  "checkout_session.payment.paid",
  "payment.failed",
  "payment.refunded",
];

type WebhookResource = {
  id: string;
  attributes: { url?: string; secret_key?: string; status?: string };
};

// Registers our callback URL in the partner's own PayMongo account, so they
// never have to copy anything into a dashboard.
//
// The secret is only ever returned by PayMongo at creation, so an existing
// webhook we can't read the secret of is useless to us: in that case we say so
// and let the partner paste it by hand.
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
    // Reuse before creating: PayMongo caps webhooks per account, and a partner
    // reconnecting shouldn't accumulate dead endpoints.
    const existing = await request<WebhookResource[]>(
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

    const created = await request<WebhookResource>(
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

function verifySignature(
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
  // `li` for live ones; checking both means a partner switching from test to
  // live keys can't quietly stop settling, and it stays correct if a third
  // component is ever added.
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

// --- checkout sessions ------------------------------------------------------

type PaymentAttrs = {
  id?: string;
  attributes?: {
    status?: string;
    source?: { type?: string };
    last_refund_id?: string | null;
  };
};

type SessionAttrs = {
  status?: string;
  checkout_url?: string;
  client_key?: string;
  payments?: PaymentAttrs[];
  payment_method_used?: string | null;
};

function methodTypeOf(source?: string | null): "CARD" | "GCASH" | "MAYA" | undefined {
  if (source === "card") return "CARD";
  if (source === "gcash") return "GCASH";
  if (source === "paymaya") return "MAYA";
  return undefined;
}

// The paid payment inside a session, if there is one. PayMongo lists every
// attempt, so this deliberately looks for a PAID one rather than the first.
function paidPayment(session: SessionAttrs): PaymentAttrs | null {
  return (
    session.payments?.find((p) => p.attributes?.status === "paid") ?? null
  );
}

export function paymongoVenueGateway(creds: GatewayCredentials): VenueGateway {
  const secretKey = creds.secretKey;

  async function getSession(sessionId: string): Promise<SessionAttrs> {
    const data = await request(
      secretKey,
      "GET",
      `/checkout_sessions/${sessionId}`
    );
    return data.attributes as SessionAttrs;
  }

  // A refund needs the pay_… id, but what we store is whatever charge()
  // returned — the cs_… session id. Resolving here means no caller has to know
  // the difference, and it self-heals when providerRef was never recorded.
  async function resolvePaymentId(id: string): Promise<string | null> {
    if (id.startsWith("pay_")) return id;
    const session = await getSession(id);
    return paidPayment(session)?.id ?? null;
  }

  return {
    id: "paymongo",
    checkout: "hosted",

    async verifyCredentials() {
      // Shape first, because it costs nothing and catches the mistakes people
      // actually make: pasting the same key twice, or one key from each mode.
      const publicMode = keyMode(creds.publicKey);
      const secretMode = keyMode(secretKey);

      if (!creds.publicKey.startsWith("pk_") || !publicMode) {
        return {
          ok: false,
          message: "That doesn't look like a PayMongo publishable key (pk_test_… or pk_live_…).",
        };
      }
      if (!secretKey.startsWith("sk_") || !secretMode) {
        return {
          ok: false,
          message: "That doesn't look like a PayMongo secret key (sk_test_… or sk_live_…).",
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
        await request(secretKey, "GET", "/webhooks");
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

      return {
        ok: true,
        accountLabel: `PayMongo (${secretMode} mode)`,
      };
    },

    async charge(input: VenueChargeInput): Promise<ChargeResult> {
      const centavos = toCentavos(input.amount.amount);
      if (centavos < MIN_CENTAVOS) {
        return {
          status: "failed",
          paymentId: null,
          code: "amount_too_small",
          message: "PayMongo can't process a payment below ₱1.00.",
          raw: { amount: input.amount },
        };
      }

      try {
        const data = await request(secretKey, "POST", "/checkout_sessions", {
          data: {
            attributes: {
              line_items: [
                {
                  name: input.description,
                  amount: centavos,
                  currency: "PHP",
                  quantity: 1,
                },
              ],
              payment_method_types: ["card", "gcash", "paymaya"],
              description: input.description,
              // Our own id, so a payment in their PayMongo dashboard can be
              // traced back to a booking without asking us.
              reference_number: input.metadata.paymentId ?? input.idempotencyKey,
              metadata: input.metadata,
              success_url: input.returnUrl,
              cancel_url: input.returnUrl,
              send_email_receipt: false,
            },
          },
        });

        const attrs = data.attributes as SessionAttrs;
        if (!attrs.checkout_url) {
          return {
            status: "failed",
            paymentId: data.id,
            code: "no_checkout_url",
            message: "PayMongo didn't return a checkout page. Please try again.",
            raw: attrs,
          };
        }

        // Always requires_action: a hosted checkout is a redirect by
        // definition. The booking stays PENDING and its hold keeps running
        // until the webhook or the return-leg poll says otherwise.
        return {
          status: "requires_action",
          paymentId: data.id,
          redirectUrl: attrs.checkout_url,
          clientKey: attrs.client_key ?? null,
          raw: attrs,
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
        const session = await getSession(providerPaymentId);
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
        const paymentId = await resolvePaymentId(providerPaymentId);
        if (!paymentId) {
          return {
            status: "failed",
            code: "no_payment",
            message: "PayMongo has no completed payment for that booking.",
            raw: { providerPaymentId },
          };
        }

        const data = await request(secretKey, "POST", "/refunds", {
          data: {
            attributes: {
              amount: toCentavos(amount.amount),
              payment_id: paymentId,
              // PayMongo's enum. A venue cancellation is the customer asking,
              // as far as the gateway is concerned.
              reason: "requested_by_customer",
              notes: reason?.slice(0, 255),
            },
          },
        });

        const attrs = data.attributes as { status?: string; amount?: number };
        return {
          // A PayMongo refund can settle asynchronously for e-wallets; either
          // way the money is committed, and our ledger records it once.
          status: attrs.status === "succeeded" ? "succeeded" : "pending",
          refundId: data.id,
          amount: {
            amount: attrs.amount != null ? toPesos(attrs.amount) : amount.amount,
            currency: "PHP",
          },
          raw: attrs,
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
      const ok = verifySignature(
        creds.webhookSecret,
        rawBody,
        headers.get("paymongo-signature"),
        Math.floor(Date.now() / 1000)
      );
      if (!ok) return null;

      let body: {
        data?: {
          id?: string;
          attributes?: {
            type?: string;
            data?: PayMongoResource;
          };
        };
      };
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }

      const eventId = body.data?.id;
      const eventType = body.data?.attributes?.type;
      const resource = body.data?.attributes?.data;
      if (!eventId || !eventType || !resource?.id) return null;

      if (eventType === "checkout_session.payment.paid") {
        const session = resource.attributes as SessionAttrs;
        const paid = paidPayment(session);
        return {
          eventId,
          // The SESSION id: that's what charge() handed back and what the
          // BookingPayment row is keyed on.
          providerPaymentId: resource.id,
          type: "payment.succeeded",
          reference: paid?.id ?? null,
          failureCode: null,
          failureMessage: null,
          methodType: methodTypeOf(
            paid?.attributes?.source?.type ?? session.payment_method_used
          ),
          raw: body,
        };
      }

      if (eventType === "payment.failed" || eventType === "payment.refunded") {
        const payment = resource.attributes as {
          status?: string;
          last_payment_error?: string;
          source?: { type?: string };
          // Present on a payment created through a checkout session.
          checkout_session_id?: string;
        };
        const sessionId = payment.checkout_session_id;
        // Without a session id we can't match it to a BookingPayment row, and
        // guessing would risk touching the wrong one.
        if (!sessionId) return null;

        return {
          eventId,
          providerPaymentId: sessionId,
          type: eventType === "payment.failed" ? "payment.failed" : "payment.refunded",
          reference: resource.id,
          failureCode: eventType === "payment.failed" ? "payment_failed" : null,
          failureMessage:
            eventType === "payment.failed"
              ? (payment.last_payment_error ??
                "The payment was not completed.")
              : null,
          methodType: methodTypeOf(payment.source?.type),
          raw: body,
        };
      }

      // An event we didn't subscribe to. Not an error — just nothing to do.
      return null;
    },
  };
}
