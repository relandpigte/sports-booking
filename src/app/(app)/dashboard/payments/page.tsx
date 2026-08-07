import type { Metadata } from "next";
import Link from "next/link";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { CheckoutModeSettings } from "@/components/partner/ManualPaymentSettings";
import { ServiceFeePanel } from "@/components/partner/ServiceFeePanel";
import { requireActivePartner } from "@/lib/dal";
import { getGatewayView } from "@/lib/partner-gateway";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import {
  pollLatestServiceFeeCheckout,
  pollServiceFeeCheckout,
} from "@/lib/service-fee-payments";
import { getPartnerServiceFeeView } from "@/lib/service-fees";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";
import { getActivePartnerGateway } from "@/lib/partner-gateway";
import { formatPHP } from "@/lib/currency";
import { getPartnerManualPaymentSettings } from "@/lib/manual-payments";

export const metadata: Metadata = {
  title: "Payments — Bunal.club",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ settlement?: string; setup?: string }>;
}) {
  const partner = await requireActivePartner();
  const { settlement, setup } = await searchParams;
  const impersonation = await getCurrentPartnerImpersonation();

  if (impersonation) {
    const [gateway, serviceFees] = await Promise.all([
      getActivePartnerGateway(partner.id),
      getPartnerServiceFeeView(partner.id),
    ]);

    return (
      <div>
        <DashboardPageHeader
          eyebrow="Payment workspace"
          title="Payments"
          description="Review payment readiness and service-fee standing for this partner."
        />
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="font-bold text-amber-950">Payment controls are protected</p>
          <p className="mt-1 text-sm leading-6 text-amber-800">
            You can review status while assisting, but you cannot view or change
            gateway credentials, connect or disconnect PayMongo, pay a
            settlement, or submit a receipt.
          </p>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <PaymentStatusCard
            label="PayMongo"
            value={gateway ? "Connected" : "Not connected"}
          />
          <PaymentStatusCard
            label="Outstanding fees"
            value={formatPHP(serviceFees.balance.amountDue)}
          />
          <PaymentStatusCard
            label="Under review"
            value={formatPHP(serviceFees.balance.pending)}
          />
          <PaymentStatusCard
            label="Overdue"
            value={formatPHP(serviceFees.balance.overdueAmount)}
          />
        </div>
      </div>
    );
  }

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
  const [gateway, serviceFees, paymentSettings] = await Promise.all([
    getGatewayView(partner.id),
    getPartnerServiceFeeView(partner.id),
    getPartnerManualPaymentSettings(partner.id),
  ]);
  const paymongoSettlementEnabled = await platformPaymongoConfigured();
  const checkoutReady =
    paymentSettings.mode === "MANUAL"
      ? paymentSettings.methods.some((method) => method.active)
      : gateway?.connected === true;

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Payment workspace"
        title="Payments"
        description="Configure player checkout, payment destinations, and service-fee settlements."
      />
      {setup === "hub" && (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 ${
            checkoutReady
              ? "border-green-200 bg-green-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              checkoutReady ? "text-green-800" : "text-amber-800"
            }`}
          >
            {checkoutReady
              ? paymentSettings.mode === "MANUAL"
                ? "Manual checkout is ready"
                : "PayMongo is connected"
              : "Finish a payment setup to open online bookings"}
          </p>
          <p
            className={`mt-0.5 text-sm ${
              checkoutReady ? "text-green-700" : "text-amber-700"
            }`}
          >
            {checkoutReady
              ? "Your verified venues can accept player payments and online bookings."
              : "Your published hubs can remain visible as Coming soon. Connect PayMongo or add manual payment networks, then select the mode you want for new reservations."}
          </p>
          {checkoutReady && (
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
        <CheckoutModeSettings
          mode={paymentSettings.mode}
          methods={paymentSettings.methods}
          gateway={gateway}
        />
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

function PaymentStatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-navy">{value}</p>
    </div>
  );
}
