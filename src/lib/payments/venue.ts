import "server-only";

import { paymongoVenueGateway } from "./paymongo-venue";
import type { GatewayCredentials, VenueGateway } from "./partner-types";

// Credentials are passed at CONSTRUCTION, never as a method parameter — so a
// secret can't end up in a log line or a serialised call argument.
//
// PayMongo is the only gateway. Another one is a new file implementing
// VenueGateway plus a case here.
export function getVenueGateway(creds: GatewayCredentials): VenueGateway {
  switch (creds.provider) {
    case "paymongo":
      return paymongoVenueGateway(creds);
    default:
      // Reachable only for a row written by a gateway that has since been
      // removed. Callers that touch old money — refunds especially — catch
      // this and say so rather than 500ing.
      throw new UnknownVenueGateway(creds.provider);
  }
}

export class UnknownVenueGateway extends Error {
  constructor(readonly provider: string) {
    super(
      `That payment was taken through "${provider}", which is no longer supported.`
    );
  }
}

export * from "./partner-types";
