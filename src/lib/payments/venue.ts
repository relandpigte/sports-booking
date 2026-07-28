import "server-only";

import { fakeVenueGateway } from "./fake-venue";
import type { GatewayCredentials, VenueGateway } from "./partner-types";

// Credentials are passed at CONSTRUCTION, never as a method parameter — so a
// secret can't end up in a log line or a serialised call argument.
//
// A real gateway is one new file implementing VenueGateway plus one case here.
export function getVenueGateway(creds: GatewayCredentials): VenueGateway {
  switch (creds.provider) {
    case "fake":
      return fakeVenueGateway(creds);
    // case "paymongo":
    //   return paymongoVenueGateway(creds);
    default:
      throw new Error(`Unknown venue gateway: ${creds.provider}`);
  }
}

export * from "./partner-types";
