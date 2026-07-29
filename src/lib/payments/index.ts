import "server-only";

import { paymongoProvider } from "./paymongo";
import type { PaymentProvider } from "./types";

// The gateway the PLATFORM bills through — partners paying Bunal.ph for their
// monthly plan. Players paying venues go through getVenueGateway instead, which
// uses each partner's own account.
//
// PayMongo is the only implementation: there is no simulated provider any more,
// so a payment either moves real money or fails honestly. Local development
// therefore needs PAYMONGO_SECRET_KEY and a public https APP_URL for webhooks.
export function getPaymentProvider(): PaymentProvider {
  const id = process.env.PAYMENT_PROVIDER ?? "paymongo";
  switch (id) {
    case "paymongo":
      return paymongoProvider;
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER: ${id}. The only supported value is "paymongo".`
      );
  }
}

export * from "./types";
