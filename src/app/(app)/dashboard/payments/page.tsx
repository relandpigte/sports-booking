import type { Metadata } from "next";
import Link from "next/link";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { CheckoutModeSettings } from "@/components/partner/ManualPaymentSettings";
import { PaymentWorkspace } from "@/components/partner/PaymentWorkspace";
import { ServiceFeePanel } from "@/components/partner/ServiceFeePanel";
import { formatPHP } from "@/lib/currency";
import { getGatewayView } from "@/lib/partner-gateway";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import {
  pollLatestServiceFeeCheckout,
  pollServiceFeeCheckout,
} from "@/lib/service-fee-payments";
import { getPartnerServiceFeeView } from "@/lib/service-fees";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";
import { getPartnerManualPaymentSettings } from "@/lib/manual-payments";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "Payments — Bunal.club",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ settlement?: string; setup?: string }>;
}) {
  const workspace = await requirePartnerWorkspace("payments");
  const canManage = hasStaffAccess(workspace, "payments", "MANAGE");
  const canSettle = workspace.kind === "OWNER";
  const { settlement, setup } = await searchParams;
  const impersonation = await getCurrentPartnerImpersonation();

  if (canSettle && !impersonation) {
    if (settlement) {
      await pollServiceFeeCheckout({
        settlementId: settlement,
        partnerId: workspace.partnerId,
      });
    } else {
      // Recovery for a closed tab, failed return redirect, or temporarily
      // unavailable webhook: merely reopening Payments reconciles with PayMongo.
      await pollLatestServiceFeeCheckout(workspace.partnerId);
    }
  }
  const [gateway, serviceFees, paymentSettings] = await Promise.all([
    getGatewayView(workspace.partnerId),
    getPartnerServiceFeeView(workspace.partnerId),
    getPartnerManualPaymentSettings(workspace.partnerId),
  ]);
  const paymongoSettlementEnabled = await platformPaymongoConfigured();
  const checkoutReady =
    paymentSettings.mode === "MANUAL"
      ? paymentSettings.methods.some((method) => method.active)
      : gateway?.connected === true;
  const activeManualMethods = paymentSettings.methods.filter(
    (method) => method.active
  ).length;
  const settlementStatus = serviceFees.balance.blocked
    ? { value: "Overdue", tone: "danger" as const }
    : serviceFees.balance.inEnforcementGrace
      ? { value: "Due soon", tone: "warning" as const }
      : serviceFees.balance.pending > 0
        ? { value: "Under review", tone: "warning" as const }
        : { value: "Current", tone: "success" as const };

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Payment workspace"
        title="Payments"
        description="Configure player checkout, payment destinations, and service-fee settlements."
      />
      {impersonation && (
        <div className="mt-5 rounded-2xl border border-ocean/20 bg-ocean-soft p-4">
          <p className="font-bold text-navy">Full configuration assistance</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            You can edit checkout mode, manual payment networks, and the
            PayMongo connection for this partner. Every change is audited and
            requires your recent admin MFA. Settlement payments remain
            protected because they move funds rather than edit settings.
          </p>
        </div>
      )}
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
      <PaymentWorkspace
        initialTab={settlement ? "settlement" : "checkout"}
        summary={[
          {
            label: "Checkout mode",
            value:
              paymentSettings.mode === "MANUAL"
                ? "Manual transfer"
                : "Automatic QR Ph",
            detail: "Used for new bookings and registrations",
            tone: "default",
          },
          {
            label: "Payment destination",
            value:
              paymentSettings.mode === "MANUAL"
                ? activeManualMethods > 0
                  ? `${activeManualMethods} active network${activeManualMethods === 1 ? "" : "s"}`
                  : "Needs setup"
                : gateway?.connected
                  ? "PayMongo connected"
                  : "Needs setup",
            detail: checkoutReady ? "Ready to receive player payments" : "Complete setup to open bookings",
            tone: checkoutReady ? "success" : "warning",
          },
          {
            label: "Service-fee balance",
            value: formatPHP(serviceFees.balance.amountDue),
            detail:
              serviceFees.balance.pending > 0
                ? `${formatPHP(serviceFees.balance.pending)} under review`
                : `${formatPHP(serviceFees.balance.paid)} settled`,
            tone: serviceFees.balance.amountDue > 0 ? "warning" : "default",
          },
          {
            label: "Settlement status",
            value: settlementStatus.value,
            detail: serviceFees.balance.nextDueAt
              ? `Due ${formatSummaryDate(serviceFees.balance.nextDueAt)}`
              : "No upcoming deadline",
            tone: settlementStatus.tone,
          },
        ]}
        checkout={
          <CheckoutModeSettings
            mode={paymentSettings.mode}
            methods={paymentSettings.methods}
            gateway={gateway}
            readOnly={!canManage}
          />
        }
        settlement={
          <ServiceFeePanel
            balance={serviceFees.balance}
            settlements={serviceFees.settlements}
            paymongoSettlementEnabled={paymongoSettlementEnabled}
            paymentInstructions={
              process.env.SERVICE_FEE_PAYMENT_INSTRUCTIONS?.trim() ||
              "Transfer this amount using the payment details provided by the admin, then enter the reference and upload the receipt."
            }
            readOnly={!canSettle || Boolean(impersonation)}
          />
        }
      />
    </div>
  );
}

function formatSummaryDate(value: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(value);
}
