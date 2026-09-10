"use client";

import { useActionState, useRef, useState } from "react";

import {
  deleteTrainerTransactionAction,
  type DeleteTrainerTransactionState,
} from "@/lib/admin-trainer-transaction-actions";
import { formatPHP } from "@/lib/currency";

const initialState: DeleteTrainerTransactionState = {};

export function DeleteTrainerTransactionButton({
  sessionId,
  paymentId,
  reference,
  trainer,
  player,
  amount,
}: {
  sessionId: string;
  paymentId: string | null;
  reference: string;
  trainer: string;
  player: string;
  amount: number;
}) {
  const [state, action, pending] = useActionState(
    deleteTrainerTransactionAction,
    initialState
  );
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hasPayment = Boolean(paymentId);
  const dialogId = paymentId ?? sessionId;

  function openDialog() {
    setConfirmed(false);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="min-h-9 rounded-lg px-3 text-xs font-bold text-red-600 transition-colors hover:bg-red-50"
      >
        Delete
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`delete-trainer-transaction-title-${dialogId}`}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-red-100 bg-white p-0 shadow-2xl backdrop:bg-navy/60"
      >
        <form action={action} className="p-6">
          <input type="hidden" name="sessionId" value={sessionId} />
          {paymentId ? (
            <input type="hidden" name="paymentId" value={paymentId} />
          ) : null}
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">
            {hasPayment
              ? "Trainer transaction deletion"
              : "Trainer booking deletion"}
          </p>
          <h2
            id={`delete-trainer-transaction-title-${dialogId}`}
            className="mt-2 text-xl font-black text-navy"
          >
            Delete this trainer {hasPayment ? "transaction" : "booking"}?
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <dt className="text-slate-500">Reference</dt>
            <dd className="truncate text-right font-mono font-semibold text-navy">
              {reference}
            </dd>
            <dt className="text-slate-500">Trainer</dt>
            <dd className="text-right font-semibold text-navy">{trainer}</dd>
            <dt className="text-slate-500">Player</dt>
            <dd className="text-right font-semibold text-navy">{player}</dd>
            <dt className="text-slate-500">Amount</dt>
            <dd className="text-right font-black text-navy">
              {formatPHP(amount)}
            </dd>
          </dl>
          {hasPayment ? (
            <p className="mt-4 text-sm leading-6 text-red-700">
              This permanently removes the payment, linked trainer booking,
              reserved schedule slots, conversation, and service-fee records.
              It does not refund PayMongo or a manual payment.
            </p>
          ) : (
            <p className="mt-4 text-sm leading-6 text-red-700">
              No payment was created. This permanently removes the declined
              trainer booking and any linked schedule or conversation records.
            </p>
          )}
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <input
              type="checkbox"
              name="confirmed"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
            />
            <span className="font-bold">
              I understand this permanently deletes the trainer {hasPayment
                ? "transaction and its booking history"
                : "booking history"}.
            </span>
          </label>
          {state.message ? (
            <p role="alert" className="mt-3 text-xs font-semibold text-red-600">
              {state.message}
            </p>
          ) : null}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => dialogRef.current?.close()}
              className="min-h-10 rounded-lg px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || !confirmed}
              className="min-h-10 rounded-lg bg-red-600 px-4 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending
                ? "Deleting…"
                : `Delete ${hasPayment ? "transaction" : "booking"}`}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
