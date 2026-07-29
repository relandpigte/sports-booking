// Is this PayMongo account able to charge automatically yet?
//
//   npm run paymongo:probe
//
// Automatic monthly billing needs two things PayMongo switches on per account:
// the Subscriptions API, and card vaulting. As of the last run this account had
// NEITHER:
//
//   GET  /v1/subscriptions   -> 403 payment_method_not_configured
//                               "no subscription payment methods are configured
//                                for this organization"
//   POST /v1/payment_intents with setup_future_usage
//                            -> 400 "On session payments are not yet supported."
//                            -> 400 "Off session payments are not yet supported."
//
// So there is nothing to build against: a card cannot be saved, and a
// subscription cannot be created. Ask PayMongo support to enable recurring
// payments / subscriptions on the account, then run this again — when it starts
// returning objects instead of 403s, the printed JSON is what the adapter
// should be written against.
//
// TEST KEYS ONLY — it refuses to run with a live key, because it creates real
// objects in whatever account it is pointed at. Everything it makes is named
// "probe …" and the subscription is cancelled at the end.
import { paymongoRequest, PayMongoRequestError } from "@/lib/payments/paymongo-core";

const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim() ?? "";

function show(label: string, value: unknown) {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
}

// Tries a request and reports the failure instead of throwing, because the
// point is to learn which shapes PayMongo accepts.
async function attempt<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    const result = await fn();
    show(label, result);
    return result;
  } catch (error) {
    if (error instanceof PayMongoRequestError) {
      console.log(`\n=== ${label} — FAILED ===`);
      console.log(`  ${error.status} ${error.code}: ${error.message}`);
      if (error.status === 401 || error.status === 403) {
        console.log(
          "  A 401/403 here means the feature is not enabled on this account.\n" +
            "  Ask PayMongo support to turn on recurring payments, then re-run."
        );
      }
      return null;
    }
    throw error;
  }
}

async function main() {
  if (!secretKey) throw new Error("PAYMONGO_SECRET_KEY is not set.");
  if (secretKey.startsWith("sk_live_")) {
    throw new Error(
      "This is a LIVE key. The probe creates real objects — point it at a test key."
    );
  }

  console.log("Probing PayMongo Subscriptions with a test key.\n");
  console.log(
    "Every request below is printed raw. Field names in the responses are\n" +
      "what src/lib/payments/paymongo-subscriptions.ts should be written against."
  );

  // 1. A plan. Our Plan rows map onto these.
  const plan = await attempt("POST /v1/plans", () =>
    paymongoRequest(secretKey, "POST", "/plans", {
      data: {
        attributes: {
          name: "probe plan",
          amount: 49900,
          currency: "PHP",
          interval: "month",
          interval_count: 1,
          description: "Discovery only — safe to delete.",
        },
      },
    })
  );

  // 2. A customer. One per partner.
  const customer = await attempt("POST /v1/customers", () =>
    paymongoRequest(secretKey, "POST", "/customers", {
      data: {
        attributes: {
          first_name: "Probe",
          last_name: "Partner",
          email: `probe-${Date.now()}@example.test`,
          phone: "+639170000000",
          default_device: "email",
        },
      },
    })
  );

  // 3. A card, created the way the BROWSER will create it — the public key is
  // allowed to do this, which is what keeps the PAN off our server.
  const method = await attempt("POST /v1/payment_methods (card)", () =>
    paymongoRequest(secretKey, "POST", "/payment_methods", {
      data: {
        attributes: {
          type: "card",
          details: {
            card_number: "4343434343434345",
            exp_month: 12,
            exp_year: 30,
            cvc: "123",
          },
          billing: { name: "Probe Partner", email: "probe@example.test" },
        },
      },
    })
  );

  // 4. Vaulting it against the customer.
  if (customer && method) {
    await attempt("POST /v1/customers/:id/payment_methods", () =>
      paymongoRequest(
        secretKey,
        "POST",
        `/customers/${customer.id}/payment_methods`,
        { data: { attributes: { payment_method: method.id } } }
      )
    );
  }

  // 5. The subscription itself, anchored a week out — the shape registration
  // will use so the trial ends into the first automatic charge.
  const anchor = new Date(Date.now() + 7 * 86_400_000).toISOString();
  if (plan && customer) {
    const subscription = await attempt("POST /v1/subscriptions", () =>
      paymongoRequest(secretKey, "POST", "/subscriptions", {
        data: {
          attributes: {
            customer_id: customer.id,
            plan_id: plan.id,
            payment_method_id: method?.id,
            anchor_date: anchor,
          },
        },
      })
    );

    if (subscription) {
      await attempt("GET /v1/subscriptions/:id", () =>
        paymongoRequest(secretKey, "GET", `/subscriptions/${subscription.id}`)
      );
      await attempt("POST /v1/subscriptions/:id/cancel", () =>
        paymongoRequest(
          secretKey,
          "POST",
          `/subscriptions/${subscription.id}/cancel`
        )
      );
    }
  }

  console.log(
    "\n--- can a card be saved at all? ---\n" +
      "  Vaulting is the other half: without it there is nothing to auto-debit."
  );
  const customerId = customer?.id;
  if (customerId) {
    for (const sessionType of ["on_session", "off_session"] as const) {
      await attempt(`POST /v1/payment_intents (setup_future_usage ${sessionType})`, () =>
        paymongoRequest(secretKey, "POST", "/payment_intents", {
          data: {
            attributes: {
              amount: 10000,
              currency: "PHP",
              payment_method_allowed: ["card"],
              setup_future_usage: { session_type: sessionType, customer_id: customerId },
            },
          },
        })
      );
    }
  }

  console.log(
    "\nDone. A 4xx on a field name is an answer, not an error — but a 403 on\n" +
      "/subscriptions, or \"not yet supported\" on setup_future_usage, means the\n" +
      "account cannot do this yet and no amount of code will change that."
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  process.exitCode = 1;
});
