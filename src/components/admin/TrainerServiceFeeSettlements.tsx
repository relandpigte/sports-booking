/* eslint-disable @next/next/no-img-element */
import type { ServiceFeeSettlementStatus } from "@prisma/client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import { reviewTrainerServiceFeeSettlementAction } from "@/lib/trainer-payment-actions";

export type AdminTrainerServiceFeeSettlementView = {
  id: string;
  trainerId: string;
  trainerName: string;
  trainerEmail: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  status: ServiceFeeSettlementStatus;
  paymentReference: string | null;
  receiptImage: string | null;
  submittedAt: Date;
  reviewedAt: Date | null;
  reviewNote: string | null;
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(date));

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(date));

const statusMeta: Record<
  Exclude<ServiceFeeSettlementStatus, "AWAITING_PAYMENT" | "SUBMITTED">,
  { label: string; tone: BadgeTone }
> = {
  PAID: { label: "Paid", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

export function TrainerServiceFeeSettlements({
  settlements,
}: {
  settlements: AdminTrainerServiceFeeSettlementView[];
}) {
  const submitted = settlements.filter(
    (settlement) => settlement.status === "SUBMITTED"
  );
  const history = settlements.filter(
    (settlement) =>
      settlement.status !== "SUBMITTED" &&
      settlement.status !== "AWAITING_PAYMENT"
  );
  const trainerCount = new Set(
    settlements.map((settlement) => settlement.trainerId)
  ).size;
  const underReview = submitted.reduce(
    (total, settlement) => total + settlement.amount,
    0
  );
  const paid = settlements
    .filter((settlement) => settlement.status === "PAID")
    .reduce((total, settlement) => total + settlement.amount, 0);
  const rejectedCount = settlements.filter(
    (settlement) => settlement.status === "REJECTED"
  ).length;

  return (
    <>
      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Trainer settlement status
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Review remittances for Bunal.club&apos;s 3% service fee on paid
              trainer sessions.
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Dates use Asia/Manila time
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <dt className="text-xs text-gray-500">Trainers</dt>
            <dd className="mt-1 text-xl font-bold text-gray-900">
              {trainerCount}
            </dd>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <dt className="text-xs text-amber-700">Awaiting review</dt>
            <dd className="mt-1 text-xl font-bold text-amber-900">
              {formatPHP(underReview)}
            </dd>
            <p className="mt-1 text-xs text-amber-700">
              {submitted.length}{" "}
              {submitted.length === 1 ? "submission" : "submissions"}
            </p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <dt className="text-xs text-green-700">Marked paid</dt>
            <dd className="mt-1 text-xl font-bold text-green-800">
              {formatPHP(paid)}
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <dt className="text-xs text-gray-500">Rejected</dt>
            <dd className="mt-1 text-xl font-bold text-gray-900">
              {rejectedCount}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Awaiting review ({submitted.length})
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Verify each receipt before marking the trainer&apos;s remittance as
              paid.
            </p>
          </div>
          {submitted.length > 0 && (
            <Badge tone="warn">Action required</Badge>
          )}
        </div>

        {submitted.length ? (
          <div className="mt-3 flex flex-col gap-4">
            {submitted.map((settlement) => (
              <article
                key={settlement.id}
                className="grid gap-5 rounded-2xl border border-gray-200 bg-white p-5 lg:grid-cols-[minmax(0,1fr)_260px]"
              >
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {settlement.trainerName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {settlement.trainerEmail}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-navy">
                        {formatPHP(settlement.amount)}
                      </p>
                      <Badge tone="warn">Submitted</Badge>
                    </div>
                  </div>

                  <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-gray-500">Reference</dt>
                      <dd className="mt-1 break-all font-mono text-gray-900">
                        {settlement.paymentReference ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Submitted</dt>
                      <dd className="mt-1 text-gray-900">
                        {formatDateTime(settlement.submittedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Fee period</dt>
                      <dd className="mt-1 text-gray-900">
                        {formatDate(settlement.periodStart)} –{" "}
                        {formatDate(settlement.periodEnd)}
                      </dd>
                    </div>
                  </dl>

                  <form
                    action={reviewTrainerServiceFeeSettlementAction}
                    className="mt-5 flex flex-col gap-3"
                  >
                    <input
                      type="hidden"
                      name="settlementId"
                      value={settlement.id}
                    />
                    <textarea
                      name="note"
                      rows={2}
                      placeholder="Review note (optional)"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        name="decision"
                        value="PAID"
                        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"
                      >
                        Mark paid
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="REJECTED"
                        className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                      >
                        Reject proof
                      </button>
                    </div>
                  </form>
                </div>

                {settlement.receiptImage ? (
                  <a
                    href={settlement.receiptImage}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                    title="Open trainer receipt"
                  >
                    <img
                      src={settlement.receiptImage}
                      alt={`Settlement receipt from ${settlement.trainerName}`}
                      className="h-full max-h-72 w-full object-contain"
                    />
                  </a>
                ) : (
                  <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 text-center text-sm text-gray-500">
                    No receipt image attached
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No trainer settlements are waiting for review.
          </p>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-base font-semibold text-gray-900">
          Trainer review history
        </h2>
        {history.length ? (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Trainer</th>
                  <th scope="col" className="px-4 py-3 text-right">Amount</th>
                  <th scope="col" className="px-4 py-3">Reference</th>
                  <th scope="col" className="px-4 py-3">Reviewed</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((settlement) => {
                  const meta =
                    statusMeta[
                      settlement.status as "PAID" | "REJECTED"
                    ];
                  return (
                    <tr key={settlement.id} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {settlement.trainerName}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {settlement.trainerEmail}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatPHP(settlement.amount)}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">
                        {settlement.paymentReference ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {settlement.reviewedAt
                          ? formatDateTime(settlement.reviewedAt)
                          : formatDateTime(settlement.submittedAt)}
                        {settlement.reviewNote && (
                          <p className="mt-1 max-w-xs text-xs text-gray-500">
                            {settlement.reviewNote}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No trainer settlements have been reviewed yet.
          </p>
        )}
      </section>
    </>
  );
}
