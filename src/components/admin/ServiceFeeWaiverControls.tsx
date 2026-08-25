"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  reverseTrainerServiceFeeWaiverAction,
  reverseServiceFeeWaiverAction,
  waiveTrainerServiceFeeBalanceAction,
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

function AccountServiceFeeWaiverForm({
  accountId,
  accountName,
  accountType,
  amountDue,
}: {
  accountId: string;
  accountName: string;
  accountType: "partner" | "trainer";
  amountDue: number;
}) {
  const [open, setOpen] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(
    accountType === "trainer"
      ? waiveTrainerServiceFeeBalanceAction
      : waiveServiceFeeBalanceAction,
    initialState
  );

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    amountRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, pending]);

  if (!open) {
    return (
      <button
        type="button"
        disabled={amountDue < 0.01}
        onClick={() => setOpen(true)}
        className="min-h-11 rounded-lg border border-primary/25 bg-primary-soft px-3 text-xs font-bold text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
      >
        Waive balance
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) setOpen(false);
      }}
    >
      <form
        action={action}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`waiver-title-${accountId}`}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl"
      >
        <input
          type="hidden"
          name={accountType === "trainer" ? "trainerId" : "partnerId"}
          value={accountId}
        />
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
              Admin finance
            </p>
            <h2
              id={`waiver-title-${accountId}`}
              className="mt-1 text-lg font-black text-navy"
            >
              Waive service fees
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={pending}
            aria-label="Close waiver dialog"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-50"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="rounded-xl border border-primary/15 bg-primary-soft px-4 py-3">
            <p className="text-sm font-bold text-navy">{accountName}</p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Outstanding balance: {formatPHP(amountDue)}. A waiver is an
              administrative credit and is not recorded as money received.
            </p>
          </div>
          <label className="mt-4 block text-sm font-bold text-slate-700">
            Waiver amount
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-3 text-sm font-bold text-slate-400">₱</span>
              <input
                ref={amountRef}
                name="amount"
                type="number"
                min="0.01"
                max={amountDue.toFixed(2)}
                step="0.01"
                defaultValue={amountDue.toFixed(2)}
                required
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white pl-8 pr-3 text-sm font-semibold text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            {state.errors?.amount ? <span className="mt-1 block text-xs text-red-700">{state.errors.amount}</span> : null}
          </label>
          <label className="mt-4 block text-sm font-bold text-slate-700">
            Reason
            <textarea
              name="reason"
              required
              minLength={10}
              maxLength={500}
              rows={4}
              placeholder="Example: Waive fees from approved payment testing."
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
            {state.errors?.reason ? <span className="mt-1 block text-xs text-red-700">{state.errors.reason}</span> : null}
          </label>
          <div className="mt-3"><ActionFeedback state={state} /></div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
          <button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50">
            Cancel
          </button>
          <button disabled={pending} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-black text-white hover:bg-primary-hover disabled:opacity-50">
            {pending ? "Waiving…" : "Grant waiver"}
          </button>
        </div>
      </form>
    </div>
  );
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
  return (
    <AccountServiceFeeWaiverForm
      accountId={partnerId}
      accountName={partnerName}
      accountType="partner"
      amountDue={amountDue}
    />
  );
}

export function TrainerServiceFeeWaiverForm({
  trainerId,
  trainerName,
  amountDue,
}: {
  trainerId: string;
  trainerName: string;
  amountDue: number;
}) {
  return (
    <AccountServiceFeeWaiverForm
      accountId={trainerId}
      accountName={trainerName}
      accountType="trainer"
      amountDue={amountDue}
    />
  );
}

function AccountReverseServiceFeeWaiverForm({
  waiverId,
  amount,
  accountType,
}: {
  waiverId: string;
  amount: number;
  accountType: "partner" | "trainer";
}) {
  const [state, action, pending] = useActionState(
    accountType === "trainer"
      ? reverseTrainerServiceFeeWaiverAction
      : reverseServiceFeeWaiverAction,
    initialState
  );
  return (
    <details className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center text-xs font-bold text-red-700">
        Reverse waiver
      </summary>
      <form
        action={action}
        className="border-t border-red-100 pb-2 pt-3"
        onSubmit={(event) => {
          if (!window.confirm(`Reverse the ${formatPHP(amount)} waiver? The ${accountType}'s outstanding balance and any overdue restriction may return immediately.`)) {
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
        <button disabled={pending} className="mt-3 min-h-11 rounded-lg bg-red-600 px-3 text-xs font-black text-white disabled:opacity-50">
          {pending ? "Reversing…" : "Confirm reversal"}
        </button>
      </form>
    </details>
  );
}

export function ReverseServiceFeeWaiverForm({
  waiverId,
  amount,
}: {
  waiverId: string;
  amount: number;
}) {
  return (
    <AccountReverseServiceFeeWaiverForm
      waiverId={waiverId}
      amount={amount}
      accountType="partner"
    />
  );
}

export function ReverseTrainerServiceFeeWaiverForm({
  waiverId,
  amount,
}: {
  waiverId: string;
  amount: number;
}) {
  return (
    <AccountReverseServiceFeeWaiverForm
      waiverId={waiverId}
      amount={amount}
      accountType="trainer"
    />
  );
}
