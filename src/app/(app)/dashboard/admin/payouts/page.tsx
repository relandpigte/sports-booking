import type { Metadata } from "next";
import type { PayoutRecipientKind } from "@prisma/client";
import Link from "next/link";

import { MarkPayoutPaidForm } from "@/components/admin/MarkPayoutPaidForm";
import { ResendPayoutEmailButton } from "@/components/admin/ResendPayoutEmailButton";
import { Badge } from "@/components/ui/Badge";
import { requireAdmin } from "@/lib/admin";
import { formatPHP } from "@/lib/currency";
import { prisma } from "@/lib/db";
import {
  latestPayoutCutoff,
  listAdminPayouts,
  listAdminUpcomingPayouts,
  nextPayoutCutoff,
  type AdminPayoutView,
} from "@/lib/payouts";

export const metadata: Metadata = {
  title: "Payouts — Bunal.club",
};

const NETWORK_LABEL = {
  GCASH: "GCash",
  MAYA: "Maya",
  BANK_TRANSFER: "Bank transfer",
} as const;

function day(value: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(value);
}

function Destination({ payout }: { payout: AdminPayoutView }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          Send by
        </dt>
        <dd className="font-semibold text-navy">
          {payout.network === "BANK_TRANSFER"
            ? (payout.bankName ?? NETWORK_LABEL.BANK_TRANSFER)
            : NETWORK_LABEL[payout.network]}
        </dd>
      </div>
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          Account name
        </dt>
        <dd className="font-semibold text-navy">{payout.accountName}</dd>
      </div>
      <div>
        <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
          Account number
        </dt>
        <dd className="font-mono font-semibold text-navy">
          {payout.accountNumber}
        </dd>
      </div>
    </dl>
  );
}

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const requested = Array.isArray(query.view) ? query.view[0] : query.view;
  const kind: PayoutRecipientKind = requested === "trainers" ? "TRAINER" : "VENUE";

  const [payouts, upcoming, venuePending, trainerPending] = await Promise.all([
    listAdminPayouts(kind),
    listAdminUpcomingPayouts(kind),
    prisma.payout.count({ where: { recipientKind: "VENUE", status: "PENDING" } }),
    prisma.payout.count({ where: { recipientKind: "TRAINER", status: "PENDING" } }),
  ]);
  const pendingTotal = payouts.pending.reduce(
    (sum, payout) => sum + payout.amount,
    0
  );
  const tabs = [
    { kind: "VENUE", label: "Venues", href: "/dashboard/admin/payouts", count: venuePending },
    {
      kind: "TRAINER",
      label: "Trainers",
      href: "/dashboard/admin/payouts?view=trainers",
      count: trainerPending,
    },
  ] as const;
  const noun = kind === "VENUE" ? "venue" : "trainer";

  return (
    <div>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            Admin finance
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy">
            Payouts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Automatic payments are collected by Bunal.club. Send each {noun} its
            share by transfer, then record the reference here. Marking a payout
            as sent emails the {noun} the exact amount and what it covers.
            Payouts are created every Monday and Thursday for everything paid
            up to the end of the day before.
          </p>
        </div>
        <p className="shrink-0 text-xs text-gray-400">
          Last run {day(latestPayoutCutoff())} · Next {day(nextPayoutCutoff())}
        </p>
      </header>

      <nav
        aria-label="Payout recipient type"
        className="mt-4 flex gap-7 border-b border-gray-200"
      >
        {tabs.map((tab) => {
          const active = tab.kind === kind;
          return (
            <Link
              key={tab.kind}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-2 border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {tab.label}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs ${
                  active
                    ? "bg-primary-soft text-primary"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {tab.count}
              </span>
            </Link>
          );
        })}
      </nav>

      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-base font-semibold text-navy">To send</h2>
          <p className="text-sm text-gray-500">
            {payouts.pending.length} payout
            {payouts.pending.length === 1 ? "" : "s"} ·{" "}
            <span className="font-bold text-navy">{formatPHP(pendingTotal)}</span>
          </p>
        </div>
        {payouts.pending.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
            Nothing to send. New payouts appear here after the next Monday or
            Thursday run.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {payouts.pending.map((payout) => (
              <li
                key={payout.id}
                className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-navy">
                      {payout.recipientName}
                    </p>
                    <p className="text-xs text-gray-500">
                      {payout.recipientEmail} · payments up to{" "}
                      {day(payout.cutoffAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-navy">
                      {formatPHP(payout.amount)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatPHP(payout.earnings)} earned
                      {payout.refunds < 0
                        ? ` − ${formatPHP(Math.abs(payout.refunds))} refunded`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 rounded-xl bg-gray-50 p-3.5">
                  <Destination payout={payout} />
                </div>
                <div className="mt-4">
                  <MarkPayoutPaidForm
                    payoutId={payout.id}
                    recipientName={payout.recipientName}
                    recipientEmail={payout.recipientEmail}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-navy">Not in a payout yet</h2>
        <p className="mt-1 text-sm text-gray-500">
          Balances building toward the next run, refunds waiting to be deducted,
          and anyone owed money with no payout account on file.
        </p>
        {upcoming.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
            No open balances.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-bold">
                    {kind === "VENUE" ? "Venue partner" : "Trainer"}
                  </th>
                  <th className="px-4 py-3 text-right font-bold">Balance</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcoming.map((row) => (
                  <tr key={row.recipientId}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">{row.recipientName}</p>
                      <p className="text-xs text-gray-500">{row.recipientEmail}</p>
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        row.balance < 0 ? "text-amber-700" : "text-navy"
                      }`}
                    >
                      {row.balance < 0 ? "−" : ""}
                      {formatPHP(Math.abs(row.balance))}
                    </td>
                    <td className="px-4 py-3">
                      {!row.hasAccount ? (
                        <Badge tone="danger">No payout account</Badge>
                      ) : row.balance < 0 ? (
                        <Badge tone="warn">Deducted from next payout</Badge>
                      ) : (
                        <Badge tone="neutral">In the next run</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-navy">Sent</h2>
        {payouts.paid.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
            No payouts have been recorded yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-bold">Recipient</th>
                  <th className="px-4 py-3 font-bold">Sent</th>
                  <th className="px-4 py-3 font-bold">Destination</th>
                  <th className="px-4 py-3 font-bold">Reference</th>
                  <th className="px-4 py-3 font-bold">Email</th>
                  <th className="px-4 py-3 text-right font-bold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.paid.map((payout) => (
                  <tr key={payout.id}>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy">
                        {payout.recipientName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {payout.recipientEmail}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {payout.paidAt ? day(payout.paidAt) : "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {payout.network === "BANK_TRANSFER"
                        ? (payout.bankName ?? NETWORK_LABEL.BANK_TRANSFER)
                        : NETWORK_LABEL[payout.network]}{" "}
                      •••• {payout.accountNumber.slice(-4)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {payout.reference}
                    </td>
                    <td className="px-4 py-3 align-top">
                      {payout.emailedAt ? (
                        <p className="text-xs text-gray-600">
                          Emailed {day(payout.emailedAt)}
                        </p>
                      ) : (
                        <Badge tone="warn">Not emailed</Badge>
                      )}
                      <div className="mt-1">
                        <ResendPayoutEmailButton payoutId={payout.id} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-navy">
                      {formatPHP(payout.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
