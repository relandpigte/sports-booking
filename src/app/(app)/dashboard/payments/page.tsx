import type { Metadata } from "next";

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
  searchParams: Promise<{ settlement?: string }>;
}) {
  const partner = await requireActivePartner();
  const { settlement } = await searchParams;
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
  const paymongoQrEnabled = await platformPaymongoConfigured();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect the account that receives player booking payments.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-5">
        <GatewayPanel gateway={gateway} />
        <ServiceFeePanel
          balance={serviceFees.balance}
          settlements={serviceFees.settlements}
          paymongoQrEnabled={paymongoQrEnabled}
          paymentInstructions={
            process.env.SERVICE_FEE_PAYMENT_INSTRUCTIONS?.trim() ||
            "Transfer this amount using the payment details provided by the admin, then enter the reference and upload the receipt."
          }
        />
      </div>
    </div>
  );
}
