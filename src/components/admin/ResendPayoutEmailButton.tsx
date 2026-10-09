"use client";

import { useActionState } from "react";

import {
  resendPayoutEmailAction,
  type ResendPayoutEmailState,
} from "@/lib/payout-actions";

const initialState: ResendPayoutEmailState = {};

// Sends a paid payout's email again, with the reference and message it was
// recorded with.
export function ResendPayoutEmailButton({ payoutId }: { payoutId: string }) {
  const [state, action, pending] = useActionState(
    resendPayoutEmailAction,
    initialState
  );

  return (
    <form action={action}>
      <input type="hidden" name="payoutId" value={payoutId} />
      <button
        disabled={pending}
        className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
      >
        {pending ? "Sending…" : "Resend email"}
      </button>
      {state.success && (
        <p role="status" className="mt-1 max-w-[14rem] text-xs text-green-700">
          {state.success}
        </p>
      )}
      {state.message && (
        <p role="alert" className="mt-1 max-w-[14rem] text-xs text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
