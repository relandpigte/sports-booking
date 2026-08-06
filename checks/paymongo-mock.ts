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
  const state: MockState = { sessions: new Map(), refunds: [], requests: [] };

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
      return json(200, { data: [] });
    }
    if (url.endsWith("/webhooks") && method === "POST") {
      return json(200, {
        data: {
          id: id("hook"),
          attributes: {
            url: body?.data?.attributes?.url,
            secret_key: "whsk_mocked",
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
