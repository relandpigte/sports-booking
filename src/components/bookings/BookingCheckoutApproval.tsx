"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import {
  simulateBookingCheckoutAction,
  type PayBookingFormState,
} from "@/lib/booking-payment-actions";

const initial: PayBookingFormState = {};

// Approve / Decline for the simulated wallet screen. A real gateway hosts this
// itself; both buttons here go through the real webhook handler with a real
// signature, so nothing about the path is faked except the money.
export function BookingCheckoutApproval({
  paymentId,
  methodLabel,
}: {
  paymentId: string;
  methodLabel: string;
}) {
  const [state, formAction, pending] = useActionState(
    simulateBookingCheckoutAction,
    initial
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-medium uppercase tracking-wide text-amber-600">
        Simulated {methodLabel} approval
      </p>

      {state.message && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
        >
          {state.message}
        </p>
      )}
      {state.success && (
        <p
          role="status"
          className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
        >
          {state.success}
        </p>
      )}

      <form action={formAction} className="flex items-center gap-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <Button
          type="submit"
          name="outcome"
          value="approve"
          disabled={pending}
          className="flex-1"
        >
          {pending ? "Confirming…" : "Approve payment"}
        </Button>
        <button
          type="submit"
          name="outcome"
          value="decline"
          disabled={pending}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          Decline
        </button>
      </form>
    </div>
  );
}
