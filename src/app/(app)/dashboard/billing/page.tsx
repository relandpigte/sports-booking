import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import {
  CancelResumePanel,
  ChangePlanPanel,
  PaymentMethodPanel,
  PayNowButton,
} from "@/components/billing/BillingPanels";
import { GatewayPanel } from "@/components/partner/GatewayPanel";
import { getBillingOverview } from "@/lib/billing";
import { getPaymentProvider } from "@/lib/payments";
import { getGatewayView } from "@/lib/partner-gateway";
import { requirePartner } from "@/lib/dal";
import { formatPHP } from "@/lib/currency";
import { formatManilaDateLong } from "@/lib/time";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/lib/constants";
import type { SubscriptionStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Billing — Bunal.ph",
};

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  TRIALING: "primary",
  ACTIVE: "success",
  PAST_DUE: "warn",
  UNPAID: "danger",
  CANCELLED: "danger",
};

// "2026-08-11T…" -> "Tuesday, 11 August 2026"
function longDate(date: Date): string {
  return formatManilaDateLong(date.toISOString().slice(0, 10));
}

export default async function BillingPage() {
  const overview = await getBillingOverview();
  // Only partners have a subscription; requirePartner already sent anyone else
  // to /dashboard.
  if (!overview) redirect("/dashboard");

  const { subscription: sub, plan, plans, courtCount } = overview;

  // requirePartner is memoized per render — getBillingOverview already called it.
  const partner = await requirePartner();
  const gateway = await getGatewayView(partner.id);

  const dateLine = (() => {
    if (sub.status === "TRIALING" && sub.trialEndsAt) {
      return `Free trial ends ${longDate(sub.trialEndsAt)}`;
    }
    if (sub.status === "ACTIVE") {
      return sub.cancelAtPeriodEnd
        ? `Cancels ${longDate(sub.currentPeriodEnd)}`
        : `${sub.autoRenew ? "Renews" : "Due"} ${longDate(sub.currentPeriodEnd)}`;
    }
    if (sub.status === "PAST_DUE" && sub.graceEndsAt) {
      return `Access ends ${longDate(sub.graceEndsAt)} — pay to keep your hubs listed`;
    }
    if (sub.status === "UNPAID") return "Your hubs are unlisted until you pay";
    return "Subscription ended";
  })();

  const renewalLine = sub.autoRenew
    ? overview.savedCard
      ? `Renews automatically on your ${overview.savedCard.brand ?? "card"} •••• ${overview.savedCard.last4}.`
      : "Renews automatically."
    : `${PAYMENT_METHOD_LABELS[sub.method] ?? sub.method} — we'll remind you to pay each month. We never charge an e-wallet automatically.`;

  const usage =
    plan.maxCourts == null
      ? `${courtCount} courts · unlimited`
      : `${courtCount} of ${plan.maxCourts} courts`;
  const usagePct =
    plan.maxCourts == null
      ? 0
      : Math.min(100, Math.round((courtCount / plan.maxCourts) * 100));

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your plan, payments, and how your hubs stay listed.
        </p>
      </div>

      {/* Subscription summary */}
      <section className="mt-6 rounded-2xl border border-gray-200 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                {plan.name}
              </h2>
              <Badge tone={STATUS_TONE[sub.status]}>
                {SUBSCRIPTION_STATUS_LABELS[sub.status]}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-gray-500">{dateLine}</p>
          </div>
          <p className="shrink-0 text-lg font-semibold text-gray-900">
            {formatPHP(plan.priceMonthly)}
            <span className="text-sm font-normal text-gray-400">/mo</span>
          </p>
        </div>

        <p className="mt-3 text-sm text-gray-500">{renewalLine}</p>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Court usage</span>
            <span className="font-medium text-gray-900">{usage}</span>
          </div>
          {plan.maxCourts != null && (
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${usagePct}%` }}
              />
            </div>
          )}
        </div>

        {overview.amountDue != null && (
          <div className="mt-5">
            <PayNowButton amount={overview.amountDue} />
          </div>
        )}
      </section>

      <div className="mt-4 flex flex-col gap-4">
        <ChangePlanPanel
          plans={plans}
          currentPlanId={plan.id}
          courtCount={courtCount}
        />
        <PaymentMethodPanel
          method={sub.method}
          card={overview.savedCard}
          hosted={getPaymentProvider().checkout === "hosted"}
        />
      </div>

      {/* History */}
      {overview.payments.length > 0 && (
        <section className="mt-4 rounded-2xl border border-gray-200 p-5 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900">Payments</h2>
          <ul className="mt-3 flex flex-col divide-y divide-gray-100">
            {overview.payments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-gray-900">
                    {longDate(p.createdAt)}
                    {p.kind === "COMP" ? " · complimentary" : ""}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
                    {p.providerRef ? ` · ${p.providerRef}` : ""}
                    {p.failureMessage ? ` · ${p.failureMessage}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-medium text-gray-900">
                    {formatPHP(p.amount)}
                  </span>
                  <Badge
                    tone={
                      p.status === "SUCCEEDED"
                        ? "success"
                        : p.status === "FAILED"
                          ? "danger"
                          : p.status === "REFUNDED"
                            ? "neutral"
                            : "warn"
                    }
                  >
                    {PAYMENT_STATUS_LABELS[p.status]}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        <CancelResumePanel cancelAtPeriodEnd={sub.cancelAtPeriodEnd} />
      </div>

      {/* The other direction of money. Everything above is what this partner
          pays Bunal.ph; everything below is what players pay the partner.
          Kept visually apart on purpose — the two must not read as one thing. */}
      <div className="mt-10 border-t border-gray-200 pt-8">
        <GatewayPanel gateway={gateway} />
      </div>
    </div>
  );
}
