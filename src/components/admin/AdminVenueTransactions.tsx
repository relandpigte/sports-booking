import Link from "next/link";

import { DeleteVenueTransactionButton } from "@/components/admin/DeleteVenueTransactionButton";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { AdminVenueTransactionPage } from "@/lib/admin-transactions";
import { formatPHP } from "@/lib/currency";

const statusTone: Record<string, BadgeTone> = {
  PENDING: "warn",
  SUCCEEDED: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

const environmentMeta: Record<
  string,
  { label: string; tone: BadgeTone }
> = {
  TEST: { label: "Test", tone: "primary" },
  LIVE: { label: "Live", tone: "success" },
  UNKNOWN: { label: "Unknown", tone: "warn" },
};

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(date));

function transactionsHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const value = params.toString();
  return `/dashboard/admin/payments${value ? `?${value}` : ""}`;
}

export function AdminVenueTransactions({
  result,
  query,
}: {
  result: AdminVenueTransactionPage;
  query: string;
}) {
  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
              Test-data tools
            </p>
            <h2 className="mt-1 text-lg font-black text-navy">
              Venue transactions
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              Find a specific court or event payment and permanently remove it
              from revenue and fee reports. Test payments are deletable, live
              payments are protected, and unknown payments require careful
              review.
            </p>
          </div>
          <form
            action="/dashboard/admin/payments"
            className="flex w-full max-w-md items-center rounded-xl border border-slate-200 bg-slate-50 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary"
          >
            <label htmlFor="transaction-search" className="sr-only">
              Search transactions
            </label>
            <input
              id="transaction-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Reference, player, email, or venue"
              className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-sm text-navy outline-none placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="mr-1 min-h-9 rounded-lg px-3 text-xs font-bold text-primary hover:bg-primary-soft"
            >
              Search
            </button>
          </form>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {result.total.toLocaleString()} {result.total === 1 ? "transaction" : "transactions"}
          </span>
          {query ? (
            <Link
              href="/dashboard/admin/payments"
              className="font-bold text-primary hover:underline"
            >
              Clear search
            </Link>
          ) : null}
        </div>
      </div>

      {result.items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3" scope="col">Reference</th>
                <th className="px-3 py-3" scope="col">Player</th>
                <th className="px-3 py-3" scope="col">Venue / item</th>
                <th className="px-3 py-3" scope="col">Status</th>
                <th className="px-3 py-3" scope="col">Environment</th>
                <th className="px-3 py-3 text-right" scope="col">Amount</th>
                <th className="px-3 py-3" scope="col">Date</th>
                <th className="px-5 py-3 text-right" scope="col">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.items.map((transaction) => (
                <tr key={transaction.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-3">
                    <p
                      title={transaction.reference}
                      className="max-w-40 truncate font-mono font-semibold text-navy"
                    >
                      {transaction.reference}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">
                      {transaction.collectionMode.toLowerCase()} · {transaction.method.toLowerCase().replaceAll("_", " ")}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-navy">{transaction.payer}</p>
                    <p className="mt-0.5 max-w-48 truncate text-[11px] text-slate-500">
                      {transaction.payerEmail ?? "Account deleted"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-navy">{transaction.venue}</p>
                    <p className="mt-0.5 max-w-64 truncate text-[11px] text-slate-500">
                      {transaction.item}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={statusTone[transaction.status] ?? "neutral"}>
                      {transaction.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        environmentMeta[transaction.environment]?.tone ??
                        "neutral"
                      }
                    >
                      {environmentMeta[transaction.environment]?.label ??
                        transaction.environment.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-black tabular-nums text-navy">
                      {formatPHP(transaction.amount)}
                    </p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                      Venue {formatPHP(transaction.venueAmount)} · Fee {formatPHP(transaction.platformFee)}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {formatDateTime(transaction.paidAt ?? transaction.createdAt)}
                  </td>
                  <td className="px-5 py-2 text-right">
                    {transaction.environment === "LIVE" ? (
                      <span
                        title="Live transactions cannot be deleted from this test-data tool."
                        className="inline-flex min-h-9 items-center px-3 text-xs font-bold text-slate-400"
                      >
                        Protected
                      </span>
                    ) : (
                      <DeleteVenueTransactionButton
                        paymentId={transaction.id}
                        reference={transaction.reference}
                        payer={transaction.payer}
                        venue={transaction.venue}
                        amount={transaction.amount}
                        environment={transaction.environment}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-10 text-center text-sm text-slate-500">
          {query
            ? "No venue transactions match this search."
            : "No venue transactions yet."}
        </p>
      )}

      {result.pageCount > 1 ? (
        <nav
          aria-label="Transaction pages"
          className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-xs"
        >
          <span className="text-slate-500">
            Page {result.page} of {result.pageCount}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link
                href={transactionsHref(query, result.page - 1)}
                className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-navy hover:bg-slate-50"
              >
                Previous
              </Link>
            ) : null}
            {result.page < result.pageCount ? (
              <Link
                href={transactionsHref(query, result.page + 1)}
                className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-navy hover:bg-slate-50"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
