import Link from "next/link";

import { getBillingOverview } from "@/lib/billing";
import { formatManilaDateLong } from "@/lib/time";
import { BILLING_NOTICE_DAYS } from "@/lib/constants";

// Shown across the partner dashboard when something needs attention. Renders
// nothing at all when the subscription is healthy and not close to renewing.
export async function BillingBanner() {
  const overview = await getBillingOverview();
  if (!overview) return null;

  const { subscription: sub } = overview;
  const endsAt = overview.accessEndsAt;
  const daysLeft = overview.daysUntilAccessEnds;

  const longDate = (d: Date) => formatManilaDateLong(d.toISOString().slice(0, 10));

  // Healthy and not near a deadline — say nothing.
  if (
    sub.status === "ACTIVE" &&
    !sub.cancelAtPeriodEnd &&
    (daysLeft == null || daysLeft > BILLING_NOTICE_DAYS)
  ) {
    return null;
  }
  if (
    sub.status === "TRIALING" &&
    daysLeft != null &&
    daysLeft > BILLING_NOTICE_DAYS
  ) {
    return null;
  }

  const severe = sub.status === "UNPAID" || sub.status === "CANCELLED";

  const message = (() => {
    if (sub.status === "UNPAID") {
      return "Your hubs are unlisted and can't take bookings until you pay.";
    }
    if (sub.status === "CANCELLED") {
      return "Your subscription has ended. Your hubs are unlisted until you resubscribe.";
    }
    if (sub.status === "PAST_DUE" && endsAt) {
      return `Service fees are due. Your hubs stay listed until ${longDate(endsAt)}.`;
    }
    if (sub.status === "TRIALING" && endsAt) {
      return `Your free trial ends ${longDate(endsAt)}.`;
    }
    if (sub.cancelAtPeriodEnd && endsAt) {
      return `Your subscription ends ${longDate(endsAt)}.`;
    }
    if (endsAt) {
      return `${sub.autoRenew ? "Renews" : "Payment due"} ${longDate(endsAt)}.`;
    }
    return "Check your billing details.";
  })();

  return (
    <div
      className={[
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm",
        severe ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800",
      ].join(" ")}
    >
      <span>{message}</span>
      <Link
        href="/dashboard/billing"
        className="shrink-0 font-medium underline"
      >
        {overview.amountDue != null ? "Pay now" : "Manage billing"}
      </Link>
    </div>
  );
}
