"use client";

import { useActionState, useRef, useState } from "react";

import {
  deleteUserAction,
  type DeleteUserState,
} from "@/lib/admin-actions";

const initialState: DeleteUserState = {};

export function DeleteUserButton({
  userId,
  name,
  email,
  showTransactionDeletionOption,
}: {
  userId: string;
  name: string;
  email: string;
  showTransactionDeletionOption: boolean;
}) {
  const [state, action, pending] = useActionState(
    deleteUserAction,
    initialState
  );
  const [confirmation, setConfirmation] = useState("");
  const [deleteVenueTransactions, setDeleteVenueTransactions] =
    useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmed =
    confirmation.trim().toLowerCase() === email.trim().toLowerCase();

  function openDialog() {
    setConfirmation("");
    setDeleteVenueTransactions(false);
    dialogRef.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="min-h-9 rounded-lg px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
      >
        Delete
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={`delete-user-title-${userId}`}
        className="m-auto w-[min(92vw,30rem)] rounded-2xl border border-red-100 bg-white p-0 shadow-2xl backdrop:bg-navy/60"
      >
        <form action={action} className="p-6">
          <input type="hidden" name="userId" value={userId} />
          <p className="text-xs font-black uppercase tracking-[0.16em] text-red-600">
            Permanent deletion
          </p>
          <h2
            id={`delete-user-title-${userId}`}
            className="mt-2 text-xl font-black text-navy"
          >
            Delete {name}?
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This permanently removes the account and its personal and
            authentication data. For player accounts, venue bookings,
            payments, and fee records remain as anonymized financial history.
            Partner-owned venue data is removed with a partner account. This
            cannot be undone.
          </p>
          {showTransactionDeletionOption ? (
            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              <input
                type="checkbox"
                name="deleteVenueTransactions"
                checked={deleteVenueTransactions}
                onChange={(event) =>
                  setDeleteVenueTransactions(event.target.checked)
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
              />
              <span>
                <span className="block font-black">
                  Also delete venue transactions
                </span>
                <span className="mt-1 block text-xs leading-5 text-red-700">
                  Removes this user&apos;s court bookings, event registrations,
                  payments, and fee entries. Venue revenue and fee balances
                  will change. Use this only for test data.
                </span>
              </span>
            </label>
          ) : null}
          <label className="mt-5 block text-xs font-bold text-slate-700">
            Type <span className="font-black text-navy">{email}</span> to
            confirm
            <input
              type="email"
              name="confirmationEmail"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              required
              aria-invalid={Boolean(state.errors?.confirmationEmail)}
              aria-describedby={
                state.errors?.confirmationEmail
                  ? `delete-user-error-${userId}`
                  : undefined
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-navy outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
            />
          </label>
          {state.errors?.confirmationEmail ? (
            <p
              id={`delete-user-error-${userId}`}
              className="mt-2 text-xs font-semibold text-red-600"
            >
              {state.errors.confirmationEmail}
            </p>
          ) : null}
          {state.message ? (
            <p
              role="alert"
              className="mt-2 text-xs font-semibold text-red-600"
            >
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
                : deleteVenueTransactions
                  ? "Delete account and transactions"
                  : "Delete permanently"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
