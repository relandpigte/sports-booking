// A PayMongo the checks can talk to, standing in at the NETWORK boundary.
//
// There used to be a second implementation of VenueGateway in src/ — a fake
// gateway shipped to production so the tests had something to hit. That is the
// wrong place for a test double: it has to be kept in step with the real
// adapter, and the code under test is then the double rather than the thing
// that runs in front of customers.
//
// This replaces global fetch instead. Everything above the wire is the
// production code path: real URLs, real Basic auth, real request bodies, real
// response parsing, real signature verification. Only PayMongo's servers are
// imaginary.
import crypto from "node:crypto";

export type MockState = {
  // Checkout sessions by id, and whether each has been paid.
  sessions: Map<
    string,
    { paid: boolean; paymentId?: string; expired?: boolean; amount?: number }
  >;
  intents: Map<
    string,
    {
      status: string;
      amount: number;
      paymentId?: string;
      clientKey: string;
      qrImageUrl?: string;
      expiresAt?: string;
      lastPaymentError?: { code: string; detail: string };
    }
  >;
  paymentMethods: Map<string, { expirySeconds?: number }>;
  webhooks: Map<
    string,
    { url: string; events: string[]; secretKey: string }
  >;
  // pay_… ids we were asked to refund.
  refunds: string[];
  // Every call made, so a check can assert what was actually sent.
  requests: {
    method: string;
    url: string;
    auth: string;
    idempotencyKey: string;
    body: unknown;
  }[];
  // Make the next call fail, to exercise the error paths.
  failNext?: { status: number; code: string; detail: string };
};

const id = (prefix: string) =>
  `${prefix}_${crypto.randomBytes(8).toString("hex")}`;

export function installPaymongoMock(): MockState {
  const state: MockState = {
    sessions: new Map(),
    intents: new Map(),
    paymentMethods: new Map(),
    webhooks: new Map(),
    refunds: [],
    requests: [],
  };

  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit
  ) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const auth = String(
      (init?.headers as Record<string, string> | undefined)?.Authorization ?? ""
    );
    const idempotencyKey = String(
      (init?.headers as Record<string, string> | undefined)?.[
        "Idempotency-Key"
      ] ?? ""
    );
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    state.requests.push({ method, url, auth, idempotencyKey, body });

    const json = (status: number, payload: unknown) =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (state.failNext) {
      const { status, code, detail } = state.failNext;
      state.failNext = undefined;
      return json(status, { errors: [{ code, detail }] });
    }

    // Auth is checked the way PayMongo checks it, so a bad key really 401s.
    const decoded = Buffer.from(auth.replace("Basic ", ""), "base64").toString();
    if (!decoded.startsWith("sk_")) {
      return json(401, { errors: [{ code: "unauthorized", detail: "Invalid key." }] });
    }

    if (url.endsWith("/webhooks") && method === "GET") {
      return json(200, {
        data: Array.from(state.webhooks, ([webhookId, webhook]) => ({
          id: webhookId,
          attributes: {
            url: webhook.url,
            events: webhook.events,
          },
        })),
      });
    }
    if (url.endsWith("/webhooks") && method === "POST") {
      const webhookId = id("hook");
      const secretKey = "whsk_mocked";
      state.webhooks.set(webhookId, {
        url: body?.data?.attributes?.url,
        events: body?.data?.attributes?.events ?? [],
        secretKey,
      });
      return json(200, {
        data: {
          id: webhookId,
          attributes: {
            url: body?.data?.attributes?.url,
            events: body?.data?.attributes?.events,
            secret_key: secretKey,
          },
        },
      });
    }
    const webhook = url.match(/\/webhooks\/(hook_[^/]+)$/);
    if (webhook && method === "PUT") {
      const existing = state.webhooks.get(webhook[1]);
      if (!existing) {
        return json(404, { errors: [{ detail: "No such webhook" }] });
      }
      state.webhooks.set(webhook[1], {
        ...existing,
        url: body?.data?.attributes?.url ?? existing.url,
        events: body?.data?.attributes?.events ?? existing.events,
      });
      return json(200, {
        data: {
          id: webhook[1],
          attributes: {
            url: body?.data?.attributes?.url,
            events: body?.data?.attributes?.events,
            secret_key: existing.secretKey,
          },
        },
      });
    }

    if (url.endsWith("/payment_intents") && method === "POST") {
      const intentId = id("pi");
      const clientKey = id("key");
      const amount = body?.data?.attributes?.amount;
      state.intents.set(intentId, {
        status: "awaiting_payment_method",
        amount,
        clientKey,
      });
      return json(200, {
        data: {
          id: intentId,
          attributes: {
            amount,
            status: "awaiting_payment_method",
            client_key: clientKey,
            payments: [],
          },
        },
      });
    }

    if (url.endsWith("/payment_methods") && method === "POST") {
      const methodId = id("pm");
      state.paymentMethods.set(methodId, {
        expirySeconds: body?.data?.attributes?.expiry_seconds,
      });
      return json(200, {
        data: {
          id: methodId,
          attributes: body?.data?.attributes,
        },
      });
    }

    const attach = url.match(/\/payment_intents\/(pi_[^/]+)\/attach$/);
    if (attach && method === "POST") {
      const found = state.intents.get(attach[1]);
      if (!found) return json(404, { errors: [{ detail: "No such intent" }] });
      const paymentMethod = state.paymentMethods.get(
        body?.data?.attributes?.payment_method
      );
      const expiresAt = new Date(
        Date.now() + (paymentMethod?.expirySeconds ?? 60) * 1_000
      ).toISOString();
      const qrImageUrl = `data:image/svg+xml;base64,${Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="white"/><path d="M16 16h80v80H16zm144 0h80v80h-80zM16 160h80v80H16z" fill="#10243a"/></svg>`
      ).toString("base64")}`;
      state.intents.set(attach[1], {
        ...found,
        status: "awaiting_next_action",
        qrImageUrl,
        expiresAt,
      });
      return json(200, {
        data: {
          id: attach[1],
          attributes: {
            amount: found.amount,
            status: "awaiting_next_action",
            client_key: found.clientKey,
            payments: [],
            next_action: {
              code: { image_url: qrImageUrl, expires_at: expiresAt },
            },
          },
        },
      });
    }

    const intent = url.match(/\/payment_intents\/(pi_[^/]+)$/);
    if (intent && method === "GET") {
      const found = state.intents.get(intent[1]);
      if (!found) return json(404, { errors: [{ detail: "No such intent" }] });
      return json(200, {
        data: {
          id: intent[1],
          attributes: {
            amount: found.amount,
            status: found.status,
            client_key: found.clientKey,
            payments: found.paymentId
              ? [
                  {
                    id: found.paymentId,
                    attributes: {
                      amount: found.amount,
                      status: "paid",
                      source: { type: "qrph" },
                    },
                  },
                ]
              : [],
            next_action: found.qrImageUrl
              ? {
                  code: {
                    image_url: found.qrImageUrl,
                    expires_at: found.expiresAt,
                  },
                }
              : null,
            last_payment_error: found.lastPaymentError,
          },
        },
      });
    }

    if (url.endsWith("/checkout_sessions") && method === "POST") {
      const sessionId = id("cs");
      state.sessions.set(sessionId, {
        paid: false,
        amount: body?.data?.attributes?.line_items?.[0]?.amount,
      });
      return json(200, {
        data: {
          id: sessionId,
          attributes: {
            status: "active",
            checkout_url: `https://checkout.paymongo.com/${sessionId}`,
            client_key: id("key"),
            payments: [],
          },
        },
      });
    }

    const session = url.match(/\/checkout_sessions\/(cs_[^/]+)$/);
    if (session && method === "GET") {
      const found = state.sessions.get(session[1]);
      if (!found) return json(404, { errors: [{ detail: "No such session" }] });
      return json(200, {
        data: {
          id: session[1],
          attributes: {
            status: found.expired ? "expired" : "active",
            payments: found.paid
              ? [
                  {
                    id: found.paymentId,
                    attributes: {
                      amount: found.amount,
                      status: "paid",
                      source: { type: "qrph" },
                    },
                  },
                ]
              : [],
          },
        },
      });
    }

    if (url.endsWith("/refunds") && method === "POST") {
      state.refunds.push(body?.data?.attributes?.payment_id);
      return json(200, {
        data: {
          id: id("ref"),
          attributes: {
            status: "succeeded",
            amount: body?.data?.attributes?.amount,
          },
        },
      });
    }

    // Anything unmocked is a 404 with a loud message rather than a silent
    // success — a check that starts calling a new endpoint should notice.
    return json(404, { errors: [{ detail: `Unmocked: ${method} ${url}` }] });
  }) as typeof fetch;

  return state;
}

// Marks a session paid, the way PayMongo would once the payer finishes.
export function payMockSession(state: MockState, sessionId: string): string {
  const paymentId = id("pay");
  const existing = state.sessions.get(sessionId);
  state.sessions.set(sessionId, {
    ...existing,
    paid: true,
    paymentId,
  });
  return paymentId;
}

export function payMockIntent(state: MockState, intentId: string): string {
  const paymentId = id("pay");
  const existing = state.intents.get(intentId);
  if (!existing) throw new Error(`No mock Payment Intent ${intentId}`);
  state.intents.set(intentId, {
    ...existing,
    status: "succeeded",
    paymentId,
  });
  return paymentId;
}

// The webhook body PayMongo posts for a completed checkout.
export function mockPaidEvent(
  sessionId: string,
  paymentId: string,
  amount?: number
): string {
  return JSON.stringify({
    data: {
      id: `evt_${sessionId}`,
      attributes: {
        type: "checkout_session.payment.paid",
        data: {
          id: sessionId,
          attributes: {
            status: "active",
            payments: [
              {
                id: paymentId,
                attributes: {
                  amount,
                  status: "paid",
                  source: { type: "qrph" },
                },
              },
            ],
          },
        },
      },
    },
  });
}

export function mockPaymentPaidEvent(
  intentId: string,
  paymentId: string,
  amount: number
): string {
  return JSON.stringify({
    data: {
      id: `evt_${intentId}`,
      attributes: {
        type: "payment.paid",
        data: {
          id: paymentId,
          type: "payment",
          attributes: {
            amount,
            status: "paid",
            payment_intent_id: intentId,
            source: { type: "qrph" },
          },
        },
      },
    },
  });
}
