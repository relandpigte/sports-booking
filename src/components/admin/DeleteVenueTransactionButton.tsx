"use client";

import { useActionState, useRef, useState } from "react";

import {
  deleteVenueTransactionAction,
  type DeleteVenueTransactionState,
} from "@/lib/admin-transaction-actions";
import { formatPHP } from "@/lib/currency";

const initialState: DeleteVenueTransactionState = {};

export function DeleteVenueTransactionButton({
  paymentId,
  reference,
  payer,
  venue,
  amount,
}: {
  paymentId: string;
  reference: string;
  payer: string;
  venue: string;
  amount: number;
}) {
  const [state, action, pending] = useActionState(
    deleteVenueTransactionAction,
    initialState
  );
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

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
        aria-labelledby={`delete-transaction-title-${paymentId}`}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-red-100 bg-white p-0 shadow-2xl backdrop:bg-navy/60"
      >
        <form action={action} className="p-6">
          <input type="hidden" name="paymentId" value={paymentId} />
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">
            Test-data cleanup
          </p>
          <h2
            id={`delete-transaction-title-${paymentId}`}
            className="mt-2 text-xl font-black text-navy"
          >
            Delete this transaction?
          </h2>
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-slate-50 p-4 text-sm">
            <dt className="text-slate-500">Reference</dt>
            <dd className="truncate text-right font-mono font-semibold text-navy">
              {reference}
            </dd>
            <dt className="text-slate-500">Player</dt>
            <dd className="text-right font-semibold text-navy">{payer}</dd>
            <dt className="text-slate-500">Venue</dt>
            <dd className="text-right font-semibold text-navy">{venue}</dd>
            <dt className="text-slate-500">Amount</dt>
            <dd className="text-right font-black text-navy">
              {formatPHP(amount)}
            </dd>
          </dl>
          <p className="mt-4 text-sm leading-6 text-red-700">
            This permanently removes the selected payment, its linked booking
            or event entry, and its service-fee records. Revenue totals will
            change. It does not refund money through PayMongo or a manual
            payment channel.
          </p>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <input
              type="checkbox"
              name="confirmed"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
            />
            <span className="font-bold">
              I understand this is permanent and should only be used for test
              data.
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
              {pending ? "Deleting…" : "Delete transaction"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
