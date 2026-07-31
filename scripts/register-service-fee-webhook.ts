// Registers the platform webhook in Bunal.ph's own PayMongo account and prints
// the signing secret it returns.
//
//   npm run paymongo:webhook
//
// PayMongo returns the signing secret once at creation. If an unusable webhook
// already exists for this URL, delete it in PayMongo and run this again.
import { registerPaymongoWebhook } from "@/lib/payments/paymongo-core";
import { appUrl } from "@/lib/urls";

async function main() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      "PAYMONGO_SECRET_KEY is not set. Add Bunal.ph's own PayMongo secret key first."
    );
  }

  const url = appUrl("/api/billing/webhook/paymongo");
  console.log(`Registering ${url}`);
  console.log(
    `Using the ${secretKey.startsWith("sk_live_") ? "LIVE" : "test"} key.`
  );

  const result = await registerPaymongoWebhook(secretKey, url);
  if (!result.ok) throw new Error(result.message);

  console.log("Webhook registered.");
  console.log("Add the returned signing secret to .env:");
  console.log(`BILLING_WEBHOOK_SECRET="${result.secret}"`);
  console.log("Restart the development server or redeploy afterward.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(
    "APP_URL must be a public HTTPS URL for PayMongo webhook delivery."
  );
  process.exitCode = 1;
});
