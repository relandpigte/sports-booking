import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { PayoutStatement as Statement, PayoutView } from "@/lib/payouts";

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

function destination(payout: PayoutView): string {
  const label =
    payout.network === "BANK_TRANSFER"
      ? (payout.bankName ?? NETWORK_LABEL.BANK_TRANSFER)
      : NETWORK_LABEL[payout.network];
  return `${label} •••• ${payout.accountNumber.slice(-4)}`;
}

function PayoutRow({ payout }: { payout: PayoutView }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-navy">
          {payout.status === "PAID" && payout.paidAt
            ? `Sent ${day(payout.paidAt)}`
            : `Payout for ${day(payout.cutoffAt)}`}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          {destination(payout)}
          {payout.reference ? ` · Ref ${payout.reference}` : ""}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-slate-400">
          {formatPHP(payout.earnings)} earned
          {payout.refunds < 0
            ? ` · ${formatPHP(Math.abs(payout.refunds))} refunded`
            : ""}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold text-navy">{formatPHP(payout.amount)}</p>
        <Badge tone={payout.status === "PAID" ? "success" : "warn"}>
          {payout.status === "PAID" ? "Sent" : "Being sent"}
        </Badge>
      </div>
    </li>
  );
}

// What Bunal.club owes and has paid one venue or trainer.
export function PayoutStatement({ statement }: { statement: Statement }) {
  const negative = statement.upcoming < 0;

  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 sm:p-5">
      <h2 className="text-base font-semibold text-navy">Payouts</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
        Bunal.club collects automatic QR Ph payments for you and transfers your
        full advertised amount every Monday and Thursday.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3.5">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {negative ? "To be deducted" : "Next payout"}
          </dt>
          <dd
            className={`mt-1 text-lg font-bold ${
              negative ? "text-amber-700" : "text-navy"
            }`}
          >
            {formatPHP(Math.abs(statement.upcoming))}
          </dd>
          <p className="mt-0.5 text-xs text-slate-500">
            {negative
              ? "Refunds issued after an earlier payout"
              : `Scheduled for ${day(statement.nextCutoffAt)}`}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3.5">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Being sent
          </dt>
          <dd className="mt-1 text-lg font-bold text-navy">
            {formatPHP(
              statement.pending.reduce((sum, payout) => sum + payout.amount, 0)
            )}
          </dd>
          <p className="mt-0.5 text-xs text-slate-500">
            {statement.pending.length === 0
              ? "Nothing waiting to be transferred"
              : `${statement.pending.length} payout${
                  statement.pending.length === 1 ? "" : "s"
                } awaiting transfer`}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3.5">
          <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Paid to date
          </dt>
          <dd className="mt-1 text-lg font-bold text-navy">
            {formatPHP(statement.paidTotal)}
          </dd>
          <p className="mt-0.5 text-xs text-slate-500">All payouts sent so far</p>
        </div>
      </dl>

      {!statement.account && statement.upcoming > 0 && (
        <p
          role="alert"
          className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800"
        >
          Add a payout account so this balance can be sent to you.
        </p>
      )}

      {statement.pending.length + statement.paid.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">
          No payouts yet. Your first one is created on the next Monday or
          Thursday after a player pays through QR Ph.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {statement.pending.map((payout) => (
            <PayoutRow key={payout.id} payout={payout} />
          ))}
          {statement.paid.map((payout) => (
            <PayoutRow key={payout.id} payout={payout} />
          ))}
        </ul>
      )}
    </section>
  );
}
