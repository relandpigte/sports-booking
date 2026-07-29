import "server-only";

import { fakeProvider } from "./fake";
import { paymongoProvider } from "./paymongo";
import type { PaymentProvider } from "./types";

// The gateway the PLATFORM bills through — partners paying Bunal.ph. Players
// paying venues go through getVenueGateway instead, which is per-partner.
//
// Still defaults to the stub: local development has no PayMongo keys and no
// public URL for a webhook. Production sets PAYMENT_PROVIDER="paymongo".
export function getPaymentProvider(): PaymentProvider {
  const id = process.env.PAYMENT_PROVIDER ?? "fake";
  switch (id) {
    case "paymongo":
      return paymongoProvider;
    case "fake":
      return fakeProvider;
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${id}`);
  }
}

export * from "./types";
