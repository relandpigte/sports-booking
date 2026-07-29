"use client";

import { useActionState, useEffect } from "react";

import { Button } from "@/components/ui/Button";
import {
  payForBookingAction,
  type PayBookingFormState,
} from "@/lib/booking-payment-actions";
import { formatPHP } from "@/lib/currency";

const initial: PayBookingFormState = {};

// One button. PayMongo hosts the form, so the player picks card, GCash or Maya
// there — no method radio here, and no card fields anywhere in this app.
export function PayBookingPanel({
  paymentId,
  amount,
  venueName,
}: {
  paymentId: string;
  amount: number;
  venueName: string;
}) {
  const [state, formAction, pending] = useActionState(
    payForBookingAction,
    initial
  );

  // The hand-off. The hold keeps running while they're away, and PayMongo's
  // return URL brings them straight back to this page.
  useEffect(() => {
    if (state.redirectUrl) window.location.href = state.redirectUrl;
  }, [state.redirectUrl]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="paymentId" value={paymentId} />

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

      <p className="rounded-xl border border-gray-200 px-3 py-3 text-sm text-gray-600">
        Pay by <span className="font-medium text-gray-900">card, GCash or
        Maya</span> on the next screen. You&apos;ll come straight back here —
        your hours stay held while you pay.
      </p>

      <Button type="submit" disabled={pending}>
        {pending ? "Taking you to PayMongo…" : `Pay ${formatPHP(amount)}`}
      </Button>

      <p className="text-center text-xs text-gray-400">
        This payment goes directly to {venueName}. Bunal.ph takes no cut.
      </p>
    </form>
  );
}
