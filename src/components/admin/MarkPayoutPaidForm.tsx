"use client";

import { useActionState, useState } from "react";

import {
  markPayoutPaidAction,
  previewPayoutEmailAction,
  type MarkPayoutPaidState,
  type PayoutEmailPreviewState,
} from "@/lib/payout-actions";

const initialState: MarkPayoutPaidState = {};
const initialPreview: PayoutEmailPreviewState = {};

const fieldClass =
  "mt-1 w-full rounded-lg border border-gray-200 px-3 text-sm font-normal text-navy";

// Records that the transfer was actually made, and emails the recipient the
// exact amount and what it covers. The reference is required: it is the only
// link between this row and the money that left the account.
export function MarkPayoutPaidForm({
  payoutId,
  recipientName,
  recipientEmail,
}: {
  payoutId: string;
  recipientName: string;
  recipientEmail: string;
}) {
  const [state, action, pending] = useActionState(
    markPayoutPaidAction,
    initialState
  );
  const [previewState, previewAction, previewing] = useActionState(
    previewPayoutEmailAction,
    initialPreview
  );
  // Controlled, so the fields survive React resetting the form after a preview.
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  if (state.success) {
    return (
      <p
        role="status"
        className={`rounded-xl px-3 py-2.5 text-sm ${
          state.email === "sent"
            ? "bg-green-50 text-green-700"
            : "bg-amber-50 text-amber-800"
        }`}
      >
        {state.success}
      </p>
    );
  }

  // A preview is only shown while it still matches what would be sent.
  const preview =
    previewState.preview &&
    previewState.preview.reference === reference.trim() &&
    previewState.preview.recipientMessage === message.trim()
      ? previewState.preview
      : null;
  const error =
    state.errors?.reference ??
    state.errors?.message ??
    state.message ??
    previewState.errors?.reference ??
    previewState.errors?.message ??
    previewState.message;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="payoutId" value={payoutId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 text-xs font-semibold text-gray-600">
          Transfer reference
          <input
            name="reference"
            required
            minLength={3}
            maxLength={120}
            autoComplete="off"
            placeholder="GCash / bank reference no."
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            className={`${fieldClass} h-10`}
          />
        </label>
        <label className="min-w-0 flex-1 text-xs font-semibold text-gray-600">
          Internal note (optional, admins only)
          <input
            name="note"
            maxLength={500}
            autoComplete="off"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className={`${fieldClass} h-10`}
          />
        </label>
      </div>
      <label className="block text-xs font-semibold text-gray-600">
        Message to {recipientName} (optional, included in the email)
        <textarea
          name="message"
          rows={2}
          maxLength={1000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={`${fieldClass} py-2`}
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Marking as sent emails {recipientEmail} the exact amount, this
          reference, and every payment the payout covers.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            formAction={previewAction}
            disabled={pending || previewing}
            className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-bold text-navy hover:bg-gray-50 disabled:opacity-50"
          >
            {previewing ? "Loading…" : "Preview email"}
          </button>
          <button
            disabled={pending || previewing}
            className="h-10 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50"
          >
            {pending ? "Saving…" : "Mark as sent"}
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      {preview && (
        <section
          aria-label="Email preview"
          className="overflow-hidden rounded-xl border border-gray-200"
        >
          <dl className="space-y-1 border-b border-gray-200 bg-gray-50 px-3.5 py-3 text-xs">
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-bold text-gray-400">To</dt>
              <dd className="min-w-0 break-words text-navy">{preview.to}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-14 shrink-0 font-bold text-gray-400">Subject</dt>
              <dd className="min-w-0 break-words font-semibold text-navy">
                {preview.subject}
              </dd>
            </div>
          </dl>
          {/* The real email HTML. The empty sandbox blocks scripts, forms and
              navigation, so nothing in it can act on the admin's session. */}
          <iframe
            title={`Email preview for ${recipientName}`}
            sandbox=""
            srcDoc={preview.html}
            className="block h-[34rem] w-full bg-white"
          />
        </section>
      )}
    </form>
  );
}
