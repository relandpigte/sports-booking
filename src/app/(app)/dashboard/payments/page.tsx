import type { Metadata } from "next";
import Link from "next/link";

import { GatewayPanel } from "@/components/partner/GatewayPanel";
import { ServiceFeePanel } from "@/components/partner/ServiceFeePanel";
import { requireActivePartner } from "@/lib/dal";
import { getGatewayView } from "@/lib/partner-gateway";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import {
  pollLatestServiceFeeCheckout,
  pollServiceFeeCheckout,
} from "@/lib/service-fee-payments";
import { getPartnerServiceFeeView } from "@/lib/service-fees";

export const metadata: Metadata = {
  title: "Payments — Bunal.ph",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ settlement?: string; setup?: string }>;
}) {
  const partner = await requireActivePartner();
  const { settlement, setup } = await searchParams;
  if (settlement) {
    await pollServiceFeeCheckout({
      settlementId: settlement,
      partnerId: partner.id,
    });
  } else {
    // Recovery for a closed tab, failed return redirect, or temporarily
    // unavailable webhook: merely reopening Payments reconciles with PayMongo.
    await pollLatestServiceFeeCheckout(partner.id);
  }
  const [gateway, serviceFees] = await Promise.all([
    getGatewayView(partner.id),
    getPartnerServiceFeeView(partner.id),
  ]);
  const paymongoSettlementEnabled = await platformPaymongoConfigured();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the account that receives player booking payments.
        </p>
      </div>
      {setup === "hub" && (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 ${
            gateway?.connected
              ? "border-green-200 bg-green-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              gateway?.connected ? "text-green-800" : "text-amber-800"
            }`}
          >
            {gateway?.connected
              ? "PayMongo is connected"
              : "Connect PayMongo before creating a hub"}
          </p>
          <p
            className={`mt-0.5 text-sm ${
              gateway?.connected ? "text-green-700" : "text-amber-700"
            }`}
          >
            {gateway?.connected
              ? "Your venue can accept player payments. You can create your hub now."
              : "Your own PayMongo account receives booking proceeds and gives every published venue a working checkout."}
          </p>
          {gateway?.connected && (
            <Link
              href="/dashboard/hubs/new"
              className="mt-2 inline-block text-sm font-semibold text-green-900 hover:underline"
            >
              Create your hub →
            </Link>
          )}
        </div>
      )}
      <div className="mt-6 flex flex-col gap-5">
        <GatewayPanel gateway={gateway} />
        <ServiceFeePanel
          balance={serviceFees.balance}
          settlements={serviceFees.settlements}
          paymongoSettlementEnabled={paymongoSettlementEnabled}
          paymentInstructions={
            process.env.SERVICE_FEE_PAYMENT_INSTRUCTIONS?.trim() ||
            "Transfer this amount using the payment details provided by the admin, then enter the reference and upload the receipt."
          }
        />
      </div>
    </div>
  );
}
