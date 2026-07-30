import type { Metadata } from "next";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { SubscriptionActions } from "@/components/admin/SubscriptionActions";
import { listPartnerSubscriptions } from "@/lib/admin-billing";
import { formatPHP } from "@/lib/currency";
import {
  PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/lib/constants";
import type { SubscriptionStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Subscriptions — Bunal.ph",
};

const STATUS_TONE: Record<SubscriptionStatus, BadgeTone> = {
  TRIALING: "primary",
  ACTIVE: "success",
  PAST_DUE: "warn",
  UNPAID: "danger",
  CANCELLED: "danger",
};

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminSubscriptionsPage() {
  // requireAdmin lives inside the DAL — this page has no guard of its own to
  // fall out of sync with.
  const { rows, summary } = await listPartnerSubscriptions();

  const stats = [
    { label: "Partners", value: String(summary.partners) },
    { label: "Active", value: String(summary.active) },
    { label: "On trial", value: String(summary.trialing) },
    { label: "Owing", value: String(summary.pastDue + summary.unpaid) },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy">Subscriptions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Service fees partners have collected for Bunal.ph, and how to get
            them.
          </p>
        </div>
        <div className="rounded-xl bg-primary-soft px-4 py-2 text-right">
          <p className="text-xs font-medium text-primary">Fees outstanding</p>
          <p className="text-lg font-bold text-primary">
            {formatPHP(summary.outstanding)}
          </p>
        </div>
      </div>


      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-gray-200 p-4"
          >
            <p className="text-2xl font-bold text-navy">{s.value}</p>
            <p className="mt-0.5 text-sm text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center text-sm text-gray-500">
          No partners have signed up yet.
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {rows.map((row) => (
            <section
              key={row.userId}
              className="rounded-2xl border border-gray-200 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-navy">
                      {row.name ?? "Partner"}
                    </h2>
                    <Badge tone={STATUS_TONE[row.status]}>
                      {SUBSCRIPTION_STATUS_LABELS[row.status]}
                    </Badge>
                    {/* The stored status can lag a transition; this is what
                        the entitlement predicate says right now, which is what
                        actually decides whether their hubs are listed. */}
                    {!row.entitled && (
                      <Badge tone="danger">Hubs unlisted</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-gray-500">{row.email}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {row.hubCount} {row.hubCount === 1 ? "hub" : "hubs"} ·{" "}
                    {row.hubCount} {row.hubCount === 1 ? "hub" : "hubs"},{" "}
                    {row.courtCount}{" "}
                    {row.courtCount === 1 ? "court" : "courts"} ·{" "}
                    {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {row.amountDue != null
                      ? `${formatPHP(row.amountDue)} in fees`
                      : "Nothing owed"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {row.amountDue != null
                      ? `Billed ${fmtDate(row.currentPeriodEnd)}`
                      : `Period ends ${fmtDate(row.currentPeriodEnd)}`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-gray-100 pt-3">
                <p className="text-xs text-gray-400">
                  {row.lastPayment
                    ? `Last: ${formatPHP(row.lastPayment.amount)} · ${row.lastPayment.status.toLowerCase()} · ${fmtDate(row.lastPayment.createdAt)}${
                        row.lastPayment.ref ? ` · ${row.lastPayment.ref}` : ""
                      }`
                    : "No payments yet"}
                </p>
                <div className="min-w-0 flex-1 sm:max-w-md">
                  <SubscriptionActions
                    userId={row.userId}
                    amountLabel={formatPHP(row.priceMonthly)}
                    openCheckoutUrl={row.openCheckoutUrl}
                  />
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
