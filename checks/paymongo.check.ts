// The PayMongo adapter, offline: signature verification, event mapping, key
// checks and amount conversion. No network, no database — everything here is
// pure except the clock.
import crypto from "node:crypto";

import {
  paymongoVenueGateway,
  signPaymongoBody,
} from "@/lib/payments/paymongo-venue";

import { ok, run } from "./harness";


const WEBHOOK = "whsk_" + crypto.randomBytes(12).toString("hex");
const OTHER = "whsk_" + crypto.randomBytes(12).toString("hex");

const gateway = paymongoVenueGateway({
  provider: "paymongo",
  publicKey: "pk_test_abcdefghij",
  secretKey: "sk_test_abcdefghij",
  webhookSecret: WEBHOOK,
});

const now = () => Math.floor(Date.now() / 1000);

function paidBody(sessionId = "cs_testsession", paymentId = "pay_testpayment") {
  return JSON.stringify({
    data: {
      id: "evt_" + crypto.randomBytes(6).toString("hex"),
      attributes: {
        type: "checkout_session.payment.paid",
        data: {
          id: sessionId,
          type: "checkout_session",
          attributes: {
            status: "active",
            payments: [
              {
                id: paymentId,
                attributes: { status: "paid", source: { type: "gcash" } },
              },
            ],
          },
        },
      },
    },
  });
}

async function verify(body: string, header: string) {
  return gateway.verifyWebhook(body, new Headers({ "paymongo-signature": header }));
}

async function main() {
  ok("paymongo is the only venue gateway", gateway.id === "paymongo");

  // --- 1. A valid test-mode signature ---------------------------------------
  const body = paidBody();
  const test = await verify(body, signPaymongoBody(WEBHOOK, body, now(), "test"));
  ok("valid te signature verifies", test !== null);
  ok("maps to payment.succeeded", test?.type === "payment.succeeded");
  ok(
    "keys off the SESSION id, not the payment id",
    test?.providerPaymentId === "cs_testsession"
  );
  ok("carries the pay_ id as the reference", test?.reference === "pay_testpayment");
  ok("reports the method the payer chose", test?.methodType === "GCASH");

  // --- 2. A valid live-mode signature ---------------------------------------
  // The header component differs (li, not te); verification must not care.
  const live = await verify(body, signPaymongoBody(WEBHOOK, body, now(), "live"));
  ok("valid li signature verifies", live !== null);

  // --- 3. Everything that must be refused -----------------------------------
  const sig = signPaymongoBody(WEBHOOK, body, now());

  ok("no signature header is refused", (await verify(body, "")) === null);
  ok(
    "a tampered body is refused",
    (await verify(body.replace("pay_testpayment", "pay_testpaymenX"), sig)) === null
  );
  ok(
    "another partner's secret is refused",
    (await verify(body, signPaymongoBody(OTHER, body, now()))) === null
  );
  ok(
    "a stale delivery is refused",
    (await verify(body, signPaymongoBody(WEBHOOK, body, now() - 3600))) === null
  );
  ok(
    "a future-dated delivery is refused",
    (await verify(body, signPaymongoBody(WEBHOOK, body, now() + 3600))) === null
  );
  ok(
    "a signature over a different timestamp is refused",
    // Right secret, right body, but t doesn't match what was signed.
    (await verify(
      body,
      `t=${now()},te=${signPaymongoBody(WEBHOOK, body, now() - 30).split("te=")[1]}`
    )) === null
  );
  ok(
    "a malformed header is refused",
    (await verify(body, "not-a-signature")) === null
  );
  ok(
    "valid signature over non-JSON is refused",
    (await verify("{{{", signPaymongoBody(WEBHOOK, "{{{", now()))) === null
  );

  // --- 4. Events we didn't ask for -------------------------------------------
  const unknown = JSON.stringify({
    data: {
      id: "evt_unknown",
      attributes: { type: "payout.deposited", data: { id: "po_1", attributes: {} } },
    },
  });
  ok(
    "an unsubscribed event type is ignored",
    (await verify(unknown, signPaymongoBody(WEBHOOK, unknown, now()))) === null
  );

  // A failed payment with no checkout session can't be matched to a booking,
  // and guessing would risk touching the wrong row.
  const orphan = JSON.stringify({
    data: {
      id: "evt_orphan",
      attributes: {
        type: "payment.failed",
        data: { id: "pay_orphan", attributes: { status: "failed" } },
      },
    },
  });
  ok(
    "a payment.failed with no session is ignored",
    (await verify(orphan, signPaymongoBody(WEBHOOK, orphan, now()))) === null
  );

  const failed = JSON.stringify({
    data: {
      id: "evt_failed",
      attributes: {
        type: "payment.failed",
        data: {
          id: "pay_failed",
          attributes: {
            status: "failed",
            checkout_session_id: "cs_testsession",
            last_payment_error: "The card was declined.",
            source: { type: "card" },
          },
        },
      },
    },
  });
  const failedEvent = await verify(
    failed,
    signPaymongoBody(WEBHOOK, failed, now())
  );
  ok("payment.failed maps through", failedEvent?.type === "payment.failed");
  ok(
    "payment.failed keys off its session",
    failedEvent?.providerPaymentId === "cs_testsession"
  );
  ok(
    "payment.failed carries the reason",
    failedEvent?.failureMessage === "The card was declined."
  );

  // --- 5. Key checks, before anything is stored ------------------------------
  const bad = async (publicKey: string, secretKey: string) =>
    paymongoVenueGateway({
      provider: "paymongo",
      publicKey,
      secretKey,
      webhookSecret: WEBHOOK,
    }).verifyCredentials();

  const noPrefix = await bad("nope", "sk_test_abcdefghij");
  ok("a non-pk publishable key is rejected", noPrefix.ok === false);

  const secretAsPublic = await bad("sk_test_abcdefghij", "sk_test_abcdefghij");
  ok("pasting the secret key twice is rejected", secretAsPublic.ok === false);

  const mixedModes = await bad("pk_test_abcdefghij", "sk_live_abcdefghij");
  ok("mismatched key modes are rejected", mixedModes.ok === false);
  ok(
    "and the message names the mismatch",
    !mixedModes.ok && /different modes/.test(mixedModes.message)
  );

  // --- 6. Amounts ------------------------------------------------------------
  // Below PayMongo's ₱1.00 floor: refused locally rather than at their API.
  const tooSmall = await gateway.charge({
    amount: { amount: 0.5, currency: "PHP" },
    description: "Court 1",
    idempotencyKey: "x:1",
    returnUrl: "https://bunal.club/dashboard/bookings/pay/x",
    metadata: {},
  });
  ok("a sub-peso charge fails without calling out", tooSmall.status === "failed");
  ok(
    "and says why",
    tooSmall.status === "failed" && tooSmall.code === "amount_too_small"
  );

}

void run(main);
