import "server-only";

import { fakeVenueGateway } from "./fake-venue";
import { paymongoVenueGateway } from "./paymongo-venue";
import type {
  GatewayCredentials,
  VenueGateway,
  VenueGatewayId,
} from "./partner-types";

// Credentials are passed at CONSTRUCTION, never as a method parameter — so a
// secret can't end up in a log line or a serialised call argument.
//
// A real gateway is one new file implementing VenueGateway plus one case here.
export function getVenueGateway(creds: GatewayCredentials): VenueGateway {
  switch (creds.provider) {
    case "paymongo":
      return paymongoVenueGateway(creds);
    case "fake":
      return fakeVenueGateway(creds);
    default:
      throw new Error(`Unknown venue gateway: ${creds.provider}`);
  }
}

// Whether the gateway owns the payment form. Answerable from the provider name
// alone, so the pay page can decide what to render without constructing a
// gateway — which would mean decrypting credentials just to draw a button.
export function isHostedCheckout(provider: string): boolean {
  return HOSTED.has(provider as VenueGatewayId);
}

const HOSTED = new Set<VenueGatewayId>(["paymongo"]);

export * from "./partner-types";
