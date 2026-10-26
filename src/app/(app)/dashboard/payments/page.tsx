import type { Metadata } from "next";
import Link from "next/link";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { CheckoutModeSettings } from "@/components/partner/ManualPaymentSettings";
import { PaymentWorkspace } from "@/components/partner/PaymentWorkspace";
import { PayoutStatement } from "@/components/payments/PayoutStatement";
import { payoutSummaryItems } from "@/components/payments/payout-summary";
import { getPayoutStatement } from "@/lib/payouts";
import { getPlatformCollectionStatus } from "@/lib/platform-gateway";
import { getCurrentImpersonation } from "@/lib/impersonation";
import { getPartnerManualPaymentSettings } from "@/lib/manual-payments";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "Payments — Bunal.club",
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string }>;
}) {
  const workspace = await requirePartnerWorkspace("payments");
  const canManage = hasStaffAccess(workspace, "payments", "MANAGE");
  const { setup } = await searchParams;
  const impersonation = await getCurrentImpersonation();

  const [statement, paymentSettings, platform] = await Promise.all([
    getPayoutStatement(workspace.partnerId, "VENUE"),
    getPartnerManualPaymentSettings(workspace.partnerId),
    getPlatformCollectionStatus(),
  ]);
  // The venue's own setup. Bunal.club's collection account is reported
  // separately below so its state is never mistaken for something the partner
  // has to fix.
  const checkoutReady =
    paymentSettings.mode === "MANUAL"
      ? paymentSettings.methods.some((method) => method.active)
      : statement.account != null;
  const collectionPaused =
    paymentSettings.mode === "AUTOMATIC" && checkoutReady && !platform.ready;
  const activeManualMethods = paymentSettings.methods.filter(
    (method) => method.active
  ).length;

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Payment workspace"
        title="Payments"
        description="Choose how players pay, set where your payouts go, and track what Bunal.club has sent you."
      />
      {impersonation && (
        <div className="mt-5 rounded-2xl border border-ocean/20 bg-ocean-soft p-4">
          <p className="font-bold text-navy">Full configuration assistance</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            You can edit checkout mode, manual payment networks, and the payout
            account for this partner. Every change is audited and requires your
            recent admin MFA.
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
                : "Your payout account is on file"
              : "Finish a payment setup to open online bookings"}
          </p>
          <p
            className={`mt-0.5 text-sm ${
              checkoutReady ? "text-green-700" : "text-amber-700"
            }`}
          >
            {checkoutReady
              ? "Your verified venues can accept player payments and online bookings."
              : "Your published hubs can remain visible as Coming soon. Add your payout account for automatic QR Ph, or add manual payment networks, then select the mode you want for new reservations."}
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
      {collectionPaused && (
        <div
          role="status"
          className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <p className="text-sm font-semibold text-amber-800">
            Automatic checkout is paused by Bunal.club
          </p>
          <p className="mt-0.5 text-sm text-amber-700">
            Your setup is complete. Online QR Ph payments are temporarily
            unavailable on our side, so players cannot book online until it is
            restored. Nothing here needs your attention.
          </p>
        </div>
      )}
      <PaymentWorkspace
        initialTab={setup === "hub" || !checkoutReady ? "checkout" : "payouts"}
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
                : statement.account
                  ? "Payout account on file"
                  : "Needs setup",
            detail: checkoutReady ? "Ready to receive player payments" : "Complete setup to open bookings",
            tone: checkoutReady ? "success" : "warning",
          },
          ...payoutSummaryItems(statement),
        ]}
        checkout={
          <CheckoutModeSettings
            mode={paymentSettings.mode}
            methods={paymentSettings.methods}
            payoutAccount={statement.account}
            canEditPayoutAccount={workspace.kind !== "STAFF"}
            readOnly={!canManage}
          />
        }
        payouts={<PayoutStatement statement={statement} />}
      />
    </div>
  );
}
