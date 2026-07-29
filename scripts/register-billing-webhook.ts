// Registers the PLATFORM webhook in Bunal.ph's own PayMongo account and prints
// the signing secret it returns.
//
//   npm run paymongo:webhook
//
// This is the one piece of the payment setup that can't be done from the app:
// partners get their webhook registered automatically when they connect, but
// the platform's own account has nobody to do it for it.
//
// PayMongo returns the signing secret ONCE, at creation. If you lose it, delete
// the webhook in their dashboard and run this again.
import { appUrl } from "@/lib/urls";
import { registerPaymongoWebhook } from "@/lib/payments/paymongo-core";

async function main() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      "PAYMONGO_SECRET_KEY is not set. Add Bunal.ph's own PayMongo secret key to .env first."
    );
  }

  const url = appUrl("/api/billing/webhook/paymongo");
  console.log(`Registering ${url}`);
  console.log(
    `Using the ${secretKey.startsWith("sk_live_") ? "LIVE" : "test"} key — the webhook is created in that mode only.\n`
  );

  const result = await registerPaymongoWebhook(secretKey, url);
  if (!result.ok) {
    throw new Error(result.message);
  }

  console.log("✓ Webhook registered.\n");
  console.log("  Put this in .env as BILLING_WEBHOOK_SECRET — it is a secret,");
  console.log("  and PayMongo will not show it again:\n");
  console.log(`  BILLING_WEBHOOK_SECRET="${result.secret}"\n`);
  console.log(
    "  Then restart the dev server, or redeploy, so it is picked up."
  );
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  console.error(
    "\n  PayMongo only accepts a public https URL. If APP_URL is localhost,"
  );
  console.error("  point it at a tunnel (ngrok, cloudflared) and try again.");
  process.exitCode = 1;
});
