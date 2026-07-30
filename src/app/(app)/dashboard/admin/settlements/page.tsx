import type { Metadata } from "next";

import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import { reviewServiceFeeSettlementAction } from "@/lib/service-fee-actions";
import { listAdminServiceFeeSettlements } from "@/lib/service-fees";

export const metadata: Metadata = {
  title: "Service Fee Settlements — Bunal.ph",
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);

export default async function AdminSettlementsPage() {
  const { submitted, history } = await listAdminServiceFeeSettlements();

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Service-fee settlements
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Verify partner remittances before crediting their fixed service-fee
          balance.
        </p>
      </div>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-gray-900">
          Awaiting review ({submitted.length})
        </h2>
        {submitted.length ? (
          <div className="mt-3 flex flex-col gap-4">
            {submitted.map((settlement) => (
              <article
                key={settlement.id}
                className="grid gap-5 rounded-2xl border border-gray-200 p-5 lg:grid-cols-[1fr_260px]"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {settlement.partnerName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {settlement.partnerEmail}
                      </p>
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {formatPHP(settlement.amount)}
                    </p>
                  </div>

                  <dl className="mt-4 flex flex-col gap-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Reference</dt>
                      <dd className="font-mono text-gray-900">
                        {settlement.paymentReference ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Submitted</dt>
                      <dd className="text-gray-900">
                        {formatDate(settlement.submittedAt)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-gray-500">Fees through</dt>
                      <dd className="text-gray-900">
                        {formatDate(settlement.periodEnd)}
                      </dd>
                    </div>
                  </dl>

                  <form
                    action={reviewServiceFeeSettlementAction}
                    className="mt-5 flex flex-col gap-3"
                  >
                    <input
                      type="hidden"
                      name="settlementId"
                      value={settlement.id}
                    />
                    <textarea
                      name="reviewNote"
                      rows={2}
                      placeholder="Review note (optional)"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value="paid"
                        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
                      >
                        Mark paid
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="rejected"
                        className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Reject proof
                      </button>
                    </div>
                  </form>
                </div>

                {settlement.receiptImage && (
                  <a
                    href={settlement.receiptImage}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                    title="Open receipt"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={settlement.receiptImage}
                      alt={`Receipt from ${settlement.partnerName}`}
                      className="h-full max-h-72 w-full object-contain"
                    />
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No settlements are waiting for review.
          </p>
        )}
      </section>

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">
            Review history
          </h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
            {history.map((settlement) => (
              <div
                key={settlement.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {settlement.partnerName} · {formatPHP(settlement.amount)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {settlement.paymentReference ?? "No reference"} ·{" "}
                    {formatDate(settlement.submittedAt)}
                    {settlement.reviewNote
                      ? ` · ${settlement.reviewNote}`
                      : ""}
                  </p>
                </div>
                <Badge
                  tone={settlement.status === "PAID" ? "success" : "danger"}
                >
                  {settlement.status === "PAID" ? "Paid" : "Rejected"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
