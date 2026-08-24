/* eslint-disable @next/next/no-img-element */
import type { ServiceFeeSettlementStatus } from "@prisma/client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { ServiceFeeStanding } from "@/lib/service-fees";
import type {
  AdminTrainerServiceFeeBreakdown,
  AdminTrainerServiceFeeTransaction,
} from "@/lib/trainer-service-fees";
import { reviewTrainerServiceFeeSettlementAction } from "@/lib/trainer-payment-actions";
import { formatSlotRange } from "@/lib/time";

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

const standingMeta: Record<
  ServiceFeeStanding,
  { label: string; tone: BadgeTone }
> = {
  OVERDUE: { label: "Overdue", tone: "danger" },
  GRACE_PERIOD: { label: "3-day grace", tone: "warn" },
  UNDER_REVIEW: { label: "Under review", tone: "warn" },
  DUE_SOON: { label: "Due soon", tone: "warn" },
  CURRENT: { label: "Current", tone: "success" },
  NO_BALANCE: { label: "No balance", tone: "neutral" },
};

export function TrainerServiceFeeSettlements({
  balances,
  transactions,
  settlements,
}: {
  balances: AdminTrainerServiceFeeBreakdown[];
  transactions: AdminTrainerServiceFeeTransaction[];
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
  const trainerCount = balances.filter(
    (trainer) => trainer.trainerStatus === "ACTIVE"
  ).length;
  const accrued = balances.reduce(
    (total, trainer) => total + trainer.balance.earned,
    0
  );
  const outstanding = balances.reduce(
    (total, trainer) => total + trainer.balance.amountDue,
    0
  );
  const underReview = submitted.reduce(
    (total, settlement) => total + settlement.amount,
    0
  );
  const paid = settlements
    .filter((settlement) => settlement.status === "PAID")
    .reduce((total, settlement) => total + settlement.amount, 0);

  return (
    <>
      <section className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Trainer settlement status
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Every confirmed trainer payment appears here when its 3% fee is
              charged. Due balances follow the same weekly deadline and
              three-day enforcement grace used for venue partners.
            </p>
          </div>
          <p className="text-xs text-gray-400">
            Dates use Asia/Manila time
          </p>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <dt className="text-xs text-gray-500">Trainers</dt>
            <dd className="mt-1 text-xl font-bold text-gray-900">
              {trainerCount}
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <dt className="text-xs text-gray-500">Accrued</dt>
            <dd className="mt-1 text-xl font-bold text-gray-900">
              {formatPHP(accrued)}
            </dd>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <dt className="text-xs text-gray-500">Outstanding</dt>
            <dd className="mt-1 text-xl font-bold text-gray-900">
              {formatPHP(outstanding)}
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
        </dl>
      </section>

      <section className="mt-8">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Trainer fee balances
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Trainers remain discoverable through their due date and three-day
            grace period. New session requests pause after enforcement starts.
          </p>
        </div>
        {balances.length ? (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[1120px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Trainer</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3 text-right">Transactions</th>
                  <th scope="col" className="px-4 py-3 text-right">Accrued</th>
                  <th scope="col" className="px-4 py-3 text-right">Settled</th>
                  <th scope="col" className="px-4 py-3 text-right">Outstanding</th>
                  <th scope="col" className="px-4 py-3 text-right">Under review</th>
                  <th scope="col" className="px-4 py-3 text-right">Overdue</th>
                  <th scope="col" className="px-4 py-3">Next deadline</th>
                  <th scope="col" className="px-4 py-3">Last settled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {balances.map((trainer) => {
                  const meta = standingMeta[trainer.standing];
                  return (
                    <tr key={trainer.trainerId} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{trainer.trainerName}</p>
                        <p className="mt-0.5 text-xs text-gray-500">{trainer.trainerEmail}</p>
                        {trainer.trainerStatus !== "ACTIVE" && (
                          <Badge tone="neutral" className="mt-1.5">
                            {trainer.trainerStatus.toLowerCase()}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td className="px-4 py-3 text-right text-gray-700">{trainer.transactionCount}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatPHP(trainer.balance.earned)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatPHP(trainer.balance.paid)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{formatPHP(trainer.balance.amountDue)}</td>
                      <td className="px-4 py-3 text-right text-amber-700">{formatPHP(trainer.balance.pending)}</td>
                      <td className="px-4 py-3 text-right font-medium text-red-600">{formatPHP(trainer.balance.overdueAmount)}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {trainer.balance.nextDueAt ? formatDate(trainer.balance.nextDueAt) : "—"}
                        {trainer.balance.enforcementAt && trainer.balance.amountDue > 0 ? (
                          <p className="mt-0.5 text-xs text-gray-500">
                            Pause {formatDate(trainer.balance.enforcementAt)}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {trainer.lastPaidAt ? (
                          <>
                            <p>{formatDate(trainer.lastPaidAt)}</p>
                            <p className="mt-0.5 text-xs text-gray-500">{formatPHP(trainer.lastPaidAmount)}</p>
                          </>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No approved trainers or trainer fee activity yet.
          </p>
        )}
      </section>

      <section className="mt-8">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            Recent trainer fee transactions
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Charge and refund entries created from confirmed trainer-session payments.
          </p>
        </div>
        {transactions.length ? (
          <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-200 bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Trainer</th>
                  <th scope="col" className="px-4 py-3">Player</th>
                  <th scope="col" className="px-4 py-3">Session</th>
                  <th scope="col" className="px-4 py-3 text-right">Player payment</th>
                  <th scope="col" className="px-4 py-3">Entry</th>
                  <th scope="col" className="px-4 py-3 text-right">Fee</th>
                  <th scope="col" className="px-4 py-3">Payment reference</th>
                  <th scope="col" className="px-4 py-3">Recorded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((transaction) => (
                  <tr key={transaction.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{transaction.trainerName}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{transaction.trainerEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{transaction.playerName}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <p>{transaction.sessionDate}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {formatSlotRange(transaction.startHour, transaction.endHour)} · {transaction.sessionPublicId}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-semibold text-gray-900">{formatPHP(transaction.paymentAmount)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Trainer {formatPHP(transaction.trainerAmount)} · {transaction.collectionMode.toLowerCase()}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {transaction.paymentStatus.toLowerCase()}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={transaction.type === "REFUND" ? "neutral" : "primary"}>{transaction.type}</Badge>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${transaction.amount < 0 ? "text-red-600" : "text-gray-900"}`}>
                      {formatPHP(transaction.amount)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{transaction.paymentReference ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{formatDateTime(transaction.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No trainer fee transactions yet.
          </p>
        )}
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
