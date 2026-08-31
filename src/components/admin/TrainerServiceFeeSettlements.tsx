/* eslint-disable @next/next/no-img-element */
import type { ServiceFeeSettlementStatus } from "@prisma/client";

import { SettlementDisclosure } from "@/components/admin/SettlementDisclosure";
import {
  ReverseTrainerServiceFeeWaiverForm,
  TrainerServiceFeeWaiverForm,
} from "@/components/admin/ServiceFeeWaiverControls";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { ServiceFeeStanding } from "@/lib/service-fees";
import { reviewTrainerServiceFeeSettlementAction } from "@/lib/trainer-payment-actions";
import type {
  AdminTrainerServiceFeeBreakdown,
  AdminTrainerServiceFeeTransaction,
  TrainerServiceFeeWaiverView,
} from "@/lib/trainer-service-fees";
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

const statusMeta: Record<"PAID" | "REJECTED", { label: string; tone: BadgeTone }> = {
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

function TrainerBalanceTable({
  balances,
}: {
  balances: AdminTrainerServiceFeeBreakdown[];
}) {
  if (!balances.length) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-xs text-gray-500">
        No approved trainers or trainer fee activity yet.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full min-w-[1240px] text-left text-xs">
        <thead className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          <tr>
            <th scope="col" className="px-4 py-2.5">Trainer</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
            <th scope="col" className="px-3 py-2.5 text-right">Ledger entries</th>
            <th scope="col" className="px-3 py-2.5 text-right">Accrued</th>
            <th scope="col" className="px-3 py-2.5 text-right">Settled</th>
            <th scope="col" className="px-3 py-2.5 text-right">Waived</th>
            <th scope="col" className="px-3 py-2.5 text-right">Outstanding</th>
            <th scope="col" className="px-3 py-2.5 text-right">Under review</th>
            <th scope="col" className="px-3 py-2.5 text-right">Overdue</th>
            <th scope="col" className="px-3 py-2.5">Next deadline</th>
            <th scope="col" className="px-4 py-2.5">Last settled</th>
            <th scope="col" className="px-4 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {balances.map((trainer) => {
            const meta = standingMeta[trainer.standing];
            return (
              <tr key={trainer.trainerId} className="align-top hover:bg-gray-50/70">
                <td className="px-4 py-2">
                  <p className="font-semibold text-navy">{trainer.trainerName}</p>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {trainer.trainerEmail}
                  </p>
                  {trainer.trainerStatus !== "ACTIVE" ? (
                    <Badge tone="neutral" className="mt-1">
                      {trainer.trainerStatus.toLowerCase()}
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{trainer.transactionCount}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900">{formatPHP(trainer.balance.earned)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-700">{formatPHP(trainer.balance.paid)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-primary">{formatPHP(trainer.balance.waived)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">{formatPHP(trainer.balance.amountDue)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{formatPHP(trainer.balance.pending)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums text-red-600">{formatPHP(trainer.balance.overdueAmount)}</td>
                <td className="px-3 py-2 text-gray-700">
                  {trainer.balance.nextDueAt ? formatDate(trainer.balance.nextDueAt) : "—"}
                  {trainer.balance.enforcementAt && trainer.balance.amountDue > 0 ? (
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      Pause {formatDate(trainer.balance.enforcementAt)}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-2 text-gray-700">
                  {trainer.lastPaidAt ? (
                    <>
                      <p>{formatDate(trainer.lastPaidAt)}</p>
                      <p className="mt-0.5 text-[11px] text-gray-500">
                        {formatPHP(trainer.lastPaidAmount)}
                      </p>
                    </>
                  ) : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <TrainerServiceFeeWaiverForm
                    trainerId={trainer.trainerId}
                    trainerName={trainer.trainerName}
                    amountDue={trainer.balance.amountDue}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TrainerWaiverList({
  waivers,
}: {
  waivers: TrainerServiceFeeWaiverView[];
}) {
  if (!waivers.length) {
    return (
      <p className="bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">
        No trainer service-fee waivers have been granted yet.
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-200">
      {waivers.map((waiver) => (
        <article key={waiver.id} className="px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-navy">
                {waiver.trainerName}
              </h3>
              <p className="text-[11px] text-gray-500">
                {waiver.trainerEmail}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums text-navy">
                {formatPHP(waiver.amount)}
              </p>
              <Badge tone={waiver.reversedAt ? "danger" : "primary"}>
                {waiver.reversedAt ? "Reversed" : "Waived"}
              </Badge>
            </div>
          </div>
          <dl className="mt-2 grid gap-2 text-[11px] sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Balance change</dt>
              <dd className="mt-0.5 font-medium text-gray-900">
                {formatPHP(waiver.balanceBefore)} → {formatPHP(waiver.balanceAfter)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Granted</dt>
              <dd className="mt-0.5 text-gray-900">
                {waiver.grantedByName} · {formatDateTime(waiver.grantedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Reason</dt>
              <dd className="mt-0.5 text-gray-900">{waiver.reason}</dd>
            </div>
          </dl>
          {waiver.reversedAt ? (
            <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700">
              <p className="font-semibold">
                Reversed
                {waiver.reversedByName ? ` by ${waiver.reversedByName}` : ""}
                {` · ${formatDateTime(waiver.reversedAt)}`}
              </p>
              {waiver.reversalReason ? (
                <p className="mt-0.5">{waiver.reversalReason}</p>
              ) : null}
            </div>
          ) : (
            <ReverseTrainerServiceFeeWaiverForm
              waiverId={waiver.id}
              amount={waiver.amount}
            />
          )}
        </article>
      ))}
    </div>
  );
}

function AwaitingTrainerReviews({
  settlements,
}: {
  settlements: AdminTrainerServiceFeeSettlementView[];
}) {
  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-navy">
            Awaiting review ({settlements.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Verify each receipt before completing a trainer remittance.
          </p>
        </div>
        {settlements.length > 0 ? <Badge tone="warn">Action required</Badge> : null}
      </div>

      {settlements.length ? (
        <div className="mt-3 flex flex-col gap-3">
          {settlements.map((settlement) => (
            <article
              key={settlement.id}
              className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 lg:grid-cols-[minmax(0,1fr)_220px]"
            >
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-navy">{settlement.trainerName}</h3>
                    <p className="text-xs text-gray-500">{settlement.trainerEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold tabular-nums text-navy">{formatPHP(settlement.amount)}</p>
                    <Badge tone="warn">Submitted</Badge>
                  </div>
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-[11px] text-gray-500">Reference</dt>
                    <dd className="mt-0.5 break-all font-mono text-gray-900">{settlement.paymentReference ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-gray-500">Submitted</dt>
                    <dd className="mt-0.5 text-gray-900">{formatDateTime(settlement.submittedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-gray-500">Fee period</dt>
                    <dd className="mt-0.5 text-gray-900">
                      {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
                    </dd>
                  </div>
                </dl>
                <form action={reviewTrainerServiceFeeSettlementAction} className="mt-4 flex flex-col gap-2.5">
                  <input type="hidden" name="settlementId" value={settlement.id} />
                  <textarea
                    name="note"
                    rows={2}
                    placeholder="Review note (optional)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button type="submit" name="decision" value="PAID" className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover">
                      Mark paid
                    </button>
                    <button type="submit" name="decision" value="REJECTED" className="min-h-11 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 hover:bg-red-50">
                      Reject proof
                    </button>
                  </div>
                </form>
              </div>
              {settlement.receiptImage ? (
                <a href={settlement.receiptImage} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50" title="Open trainer receipt">
                  <img src={settlement.receiptImage} alt={`Settlement receipt from ${settlement.trainerName}`} className="h-full max-h-56 w-full object-contain" />
                </a>
              ) : (
                <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 text-center text-xs text-gray-500">
                  No receipt image attached
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-center text-xs text-gray-500">
          No trainer settlements are waiting for review.
        </p>
      )}
    </section>
  );
}

function TrainerTransactionList({
  transactions,
}: {
  transactions: AdminTrainerServiceFeeTransaction[];
}) {
  if (!transactions.length) {
    return <p className="bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">No trainer fee transactions yet.</p>;
  }

  return (
    <div className="overflow-x-auto p-3">
      <table className="w-full min-w-[940px] text-left text-xs">
        <thead className="border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
          <tr>
            <th scope="col" className="px-3 py-2.5">Trainer</th>
            <th scope="col" className="px-3 py-2.5">Player</th>
            <th scope="col" className="px-3 py-2.5">Session</th>
            <th scope="col" className="px-3 py-2.5 text-right">Player payment</th>
            <th scope="col" className="px-3 py-2.5">Entry</th>
            <th scope="col" className="px-3 py-2.5 text-right">Fee</th>
            <th scope="col" className="px-3 py-2.5">Payment reference</th>
            <th scope="col" className="px-3 py-2.5">Recorded</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {transactions.map((transaction) => (
            <tr key={transaction.id} className="align-top">
              <td className="px-3 py-2">
                <p className="font-semibold text-navy">{transaction.trainerName}</p>
                <p className="text-[11px] text-gray-500">{transaction.trainerEmail}</p>
              </td>
              <td className="px-3 py-2 text-gray-700">{transaction.playerName}</td>
              <td className="px-3 py-2 text-gray-700">
                <p>{transaction.sessionDate}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {formatSlotRange(transaction.startHour, transaction.endHour)} · {transaction.sessionPublicId}
                </p>
              </td>
              <td className="px-3 py-2 text-right">
                <p className="font-semibold tabular-nums text-navy">{formatPHP(transaction.paymentAmount)}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  Trainer {formatPHP(transaction.trainerAmount)} · {transaction.collectionMode.toLowerCase()}
                </p>
                <p className="text-[11px] text-gray-500">{transaction.paymentStatus.toLowerCase()}</p>
              </td>
              <td className="px-3 py-2">
                <Badge tone={transaction.type === "CHARGE" ? "primary" : "neutral"}>
                  {transaction.type === "PROCESSING_CREDIT"
                    ? "PROCESSING CREDIT"
                    : transaction.type}
                </Badge>
              </td>
              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${transaction.amount < 0 ? "text-red-600" : "text-navy"}`}>
                {formatPHP(transaction.amount)}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-gray-600">{transaction.paymentReference ?? "—"}</td>
              <td className="px-3 py-2 text-gray-700">{formatDateTime(transaction.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrainerReviewList({
  settlements,
}: {
  settlements: AdminTrainerServiceFeeSettlementView[];
}) {
  if (!settlements.length) {
    return <p className="bg-gray-50 px-4 py-5 text-center text-xs text-gray-500">No trainer settlements have been reviewed yet.</p>;
  }

  return (
    <div className="divide-y divide-gray-200">
      {settlements.map((settlement) => {
        const meta = statusMeta[settlement.status as "PAID" | "REJECTED"];
        return (
          <article key={settlement.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy">{settlement.trainerName}</p>
              <p className="text-[11px] text-gray-500">{settlement.trainerEmail}</p>
              <p className="mt-1 break-all text-[11px] text-gray-500">
                <span className="font-mono">{settlement.paymentReference ?? "No reference"}</span>{" "}
                · Reviewed {formatDateTime(settlement.reviewedAt ?? settlement.submittedAt)}
              </p>
              {settlement.reviewNote ? <p className="mt-1 text-xs text-gray-600">{settlement.reviewNote}</p> : null}
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end">
              <p className="text-sm font-semibold tabular-nums text-navy">{formatPHP(settlement.amount)}</p>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function TrainerServiceFeeSettlements({
  balances,
  transactions,
  settlements,
  waivers,
}: {
  balances: AdminTrainerServiceFeeBreakdown[];
  transactions: AdminTrainerServiceFeeTransaction[];
  settlements: AdminTrainerServiceFeeSettlementView[];
  waivers: TrainerServiceFeeWaiverView[];
}) {
  const submitted = settlements.filter((settlement) => settlement.status === "SUBMITTED");
  const history = settlements.filter(
    (settlement) => settlement.status !== "SUBMITTED" && settlement.status !== "AWAITING_PAYMENT"
  );
  const trainerCount = balances.filter((trainer) => trainer.trainerStatus === "ACTIVE").length;
  const accrued = balances.reduce((total, trainer) => total + trainer.balance.earned, 0);
  const outstanding = balances.reduce((total, trainer) => total + trainer.balance.amountDue, 0);
  const underReview = submitted.reduce((total, settlement) => total + settlement.amount, 0);
  const paid = history.filter((settlement) => settlement.status === "PAID").reduce((total, settlement) => total + settlement.amount, 0);
  const waived = balances.reduce(
    (total, trainer) => total + trainer.balance.waived,
    0
  );
  const activeWaiverCount = waivers.filter(
    (waiver) => waiver.reversedAt === null
  ).length;
  const chargeCount = transactions.filter((transaction) => transaction.type === "CHARGE").length;
  const processingCreditCount = transactions.filter(
    (transaction) => transaction.type === "PROCESSING_CREDIT"
  ).length;
  const refundCount = transactions.filter((transaction) => transaction.type === "REFUND").length;
  const transactionTotal = transactions.reduce((total, transaction) => total + transaction.amount, 0);
  const paidHistoryCount = history.filter((settlement) => settlement.status === "PAID").length;
  const rejectedHistoryCount = history.length - paidHistoryCount;

  return (
    <>
      <section className="mt-5">
        <h2 className="text-sm font-semibold text-navy">Trainer fee status</h2>
        <p className="mt-0.5 max-w-3xl text-xs text-gray-500">
          Paid training sessions accrue a 3% Bunal.club fee less processing
          absorbed by the platform before remittance.
        </p>
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-white lg:grid-cols-6">
          <div className="border-b border-r border-gray-200 px-4 py-3 lg:border-b-0">
            <dt className="text-[11px] font-medium text-gray-500">Approved trainers</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{trainerCount}</dd>
          </div>
          <div className="border-b border-gray-200 px-4 py-3 lg:border-b-0 lg:border-r">
            <dt className="text-[11px] font-medium text-gray-500">Accrued</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{formatPHP(accrued)}</dd>
            <p className="text-[10px] text-gray-400">{transactions.length} {transactions.length === 1 ? "entry" : "entries"}</p>
          </div>
          <div className="border-b border-primary/10 bg-primary-soft px-4 py-3 lg:border-b-0 lg:border-r">
            <dt className="text-[11px] font-semibold text-primary">Waived</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{formatPHP(waived)}</dd>
            <p className="text-[10px] text-primary/70">{activeWaiverCount} active</p>
          </div>
          <div className="border-b border-r border-red-100 bg-red-50 px-4 py-3 lg:border-b-0">
            <dt className="text-[11px] font-semibold text-red-700">Outstanding</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-red-800">{formatPHP(outstanding)}</dd>
          </div>
          <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 lg:border-b-0 lg:border-r">
            <dt className="text-[11px] font-semibold text-amber-700">Under review</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-amber-900">{formatPHP(underReview)}</dd>
            <p className="text-[10px] text-amber-700">{submitted.length} {submitted.length === 1 ? "submission" : "submissions"}</p>
          </div>
          <div className="col-span-2 px-4 py-3 lg:col-span-1">
            <dt className="text-[11px] font-medium text-primary">Settled</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-navy">{formatPHP(paid)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-navy">Trainer balances</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Balances stay active through the deadline and three-day grace period before new requests pause.
        </p>
        <TrainerBalanceTable balances={balances} />
      </section>

      <AwaitingTrainerReviews settlements={submitted} />

      <section className="mt-6 space-y-3" aria-label="Trainer settlement audit sections">
        <SettlementDisclosure
          title="Recent fee transactions"
          count={transactions.length}
          description={`${chargeCount} charges · ${processingCreditCount} processing credits · ${refundCount} refunds · ${formatPHP(transactionTotal)} net fees`}
          label="transactions"
        >
          <TrainerTransactionList transactions={transactions} />
        </SettlementDisclosure>
        <SettlementDisclosure
          title="Trainer waiver history"
          count={waivers.length}
          description={`${activeWaiverCount} active · ${waivers.length - activeWaiverCount} reversed · administrative credits tracked separately`}
          label="trainer waiver history"
        >
          <TrainerWaiverList waivers={waivers} />
        </SettlementDisclosure>
        <SettlementDisclosure
          title="Trainer review history"
          count={history.length}
          description={`${paidHistoryCount} paid · ${rejectedHistoryCount} rejected · completed remittance decisions`}
          label="review history"
        >
          <TrainerReviewList settlements={history} />
        </SettlementDisclosure>
      </section>
    </>
  );
}
