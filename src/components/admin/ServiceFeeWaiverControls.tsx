"use client";

import { useActionState, useState } from "react";

import {
  reverseServiceFeeWaiverAction,
  waiveServiceFeeBalanceAction,
  type ServiceFeeFormState,
} from "@/lib/service-fee-actions";
import { formatPHP } from "@/lib/currency";

const initialState: ServiceFeeFormState = {};

function ActionFeedback({ state }: { state: ServiceFeeFormState }) {
  if (state.success) {
    return <p role="status" className="text-xs font-medium text-emerald-700">{state.success}</p>;
  }
  if (state.message) {
    return <p role="alert" className="text-xs font-medium text-red-700">{state.message}</p>;
  }
  return null;
}

export function ServiceFeeWaiverForm({
  partnerId,
  partnerName,
  amountDue,
}: {
  partnerId: string;
  partnerName: string;
  amountDue: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    waiveServiceFeeBalanceAction,
    initialState
  );

  if (!open) {
    return (
      <button
        type="button"
        disabled={amountDue < 0.01}
        onClick={() => setOpen(true)}
        className="min-h-9 rounded-lg border border-primary/25 bg-primary-soft px-3 text-xs font-bold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
      >
        Waive balance
      </button>
    );
  }

  return (
    <form action={action} className="w-72 rounded-xl border border-primary/20 bg-primary-soft p-3 shadow-lg">
      <input type="hidden" name="partnerId" value={partnerId} />
      <p className="text-xs font-black text-navy">Waive service fees</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-600">
        {partnerName} currently owes {formatPHP(amountDue)}. This records an admin credit, not a payment.
      </p>
      <label className="mt-3 block text-[11px] font-bold text-slate-600">
        Amount
        <div className="relative mt-1">
          <span className="pointer-events-none absolute left-3 top-2.5 text-xs font-bold text-slate-400">₱</span>
          <input
            name="amount"
            type="number"
            min="0.01"
            max={amountDue.toFixed(2)}
            step="0.01"
            defaultValue={amountDue.toFixed(2)}
            required
            className="min-h-9 w-full rounded-lg border border-slate-300 bg-white pl-7 pr-3 text-xs font-semibold text-navy outline-none focus:border-primary"
          />
        </div>
        {state.errors?.amount ? <span className="mt-1 block text-red-700">{state.errors.amount}</span> : null}
      </label>
      <label className="mt-2 block text-[11px] font-bold text-slate-600">
        Reason
        <textarea
          name="reason"
          required
          minLength={10}
          maxLength={500}
          rows={3}
          placeholder="Example: Waive fees from approved payment testing."
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-navy outline-none focus:border-primary"
        />
        {state.errors?.reason ? <span className="mt-1 block text-red-700">{state.errors.reason}</span> : null}
      </label>
      <ActionFeedback state={state} />
      <div className="mt-3 flex gap-2">
        <button disabled={pending} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-black text-white disabled:opacity-50">
          {pending ? "Waiving…" : "Grant waiver"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-lg px-3 text-xs font-bold text-slate-600 hover:bg-white">
          Close
        </button>
      </div>
    </form>
  );
}

export function ReverseServiceFeeWaiverForm({
  waiverId,
  amount,
}: {
  waiverId: string;
  amount: number;
}) {
  const [state, action, pending] = useActionState(
    reverseServiceFeeWaiverAction,
    initialState
  );
  return (
    <details className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3">
      <summary className="cursor-pointer text-xs font-bold text-red-700">Reverse waiver</summary>
      <form
        action={action}
        className="mt-3"
        onSubmit={(event) => {
          if (!window.confirm(`Reverse the ${formatPHP(amount)} waiver? The partner's outstanding balance and any overdue restriction may return immediately.`)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="waiverId" value={waiverId} />
        <label className="block text-[11px] font-bold text-red-800">
          Reversal reason
          <textarea
            name="reason"
            required
            minLength={10}
            maxLength={500}
            rows={2}
            className="mt-1 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-navy outline-none focus:border-red-400"
            placeholder="Explain why this waiver must be reversed."
          />
        </label>
        {state.errors?.reason ? <p className="mt-1 text-xs font-medium text-red-700">{state.errors.reason}</p> : null}
        <div className="mt-2"><ActionFeedback state={state} /></div>
        <button disabled={pending} className="mt-3 min-h-9 rounded-lg bg-red-600 px-3 text-xs font-black text-white disabled:opacity-50">
          {pending ? "Reversing…" : "Confirm reversal"}
        </button>
      </form>
    </details>
  );
}
