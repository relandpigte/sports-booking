import "server-only";

import { fakeProvider } from "./fake";
import type { PaymentProvider } from "./types";

// Swapping in a real gateway is one new file implementing PaymentProvider plus
// one case below.
export function getPaymentProvider(): PaymentProvider {
  const id = process.env.PAYMENT_PROVIDER ?? "fake";
  switch (id) {
    case "fake":
      return fakeProvider;
    // case "paymongo":
    //   return paymongoProvider;
    default:
      throw new Error(`Unknown PAYMENT_PROVIDER: ${id}`);
  }
}

export * from "./types";
