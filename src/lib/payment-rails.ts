import "server-only";

import type { PaymentCollector } from "@prisma/client";

import {
  loadGatewayCredentials,
  loadGatewayCredentialsForCharge,
} from "@/lib/partner-gateway";
import { paymongoChargeOps } from "@/lib/payments/paymongo-venue";
import { getVenueGateway, type PaymentRail } from "@/lib/payments/venue";
import {
  loadPlatformCredentialsForCharge,
  loadPlatformCredentialsForExistingPayment,
} from "@/lib/platform-gateway";
import { loadTrainerGatewayCredentials } from "@/lib/trainer-gateway";

// "charge" starts a new provider request and may upgrade a stale webhook
// first. "existing" touches money that already moved, so it must keep working
// for a disconnected account.
export type RailPurpose = "charge" | "existing";

type RailSource = {
  collectedBy: PaymentCollector;
  gatewayId: string | null;
};

async function platformRail(purpose: RailPurpose): Promise<PaymentRail> {
  const { secretKey } =
    purpose === "charge"
      ? await loadPlatformCredentialsForCharge()
      : await loadPlatformCredentialsForExistingPayment();
  return paymongoChargeOps(secretKey);
}

// Resolves the PayMongo account a court or event payment runs through.
//
// PLATFORM rows use Bunal.club's own account. DIRECT rows with a gateway were
// taken through the venue's own keys before platform collection and stay on
// them for their whole life. Null means there is no provider to call — a
// manual transfer, or a row whose gateway was removed.
export async function railForBookingPayment(
  payment: RailSource,
  purpose: RailPurpose
): Promise<PaymentRail | null> {
  if (payment.collectedBy === "PLATFORM") return platformRail(purpose);
  if (!payment.gatewayId) return null;
  const credentials =
    purpose === "charge"
      ? await loadGatewayCredentialsForCharge(payment.gatewayId)
      : await loadGatewayCredentials(payment.gatewayId);
  return getVenueGateway(credentials);
}

export async function railForTrainerPayment(
  payment: RailSource,
  purpose: RailPurpose
): Promise<PaymentRail | null> {
  if (payment.collectedBy === "PLATFORM") return platformRail(purpose);
  if (!payment.gatewayId) return null;
  return getVenueGateway(await loadTrainerGatewayCredentials(payment.gatewayId));
}
