"use client";

import { useActionState } from "react";

import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { Button } from "@/components/ui/Button";
import { formatPHP } from "@/lib/currency";
import {
  payForEventAction,
  type PayEventFormState,
} from "@/lib/event-payment-actions";

const initialState: PayEventFormState = {};

export function EventPaymentPanel({
  paymentId,
  publicId,
  amount,
  venueName,
}: {
  paymentId: string;
  publicId: string;
  amount: number;
  venueName: string;
}) {
  const [state, formAction, pending] = useActionState(
    payForEventAction,
    initialState
  );

  if (state.redirectUrl) {
    return <PayMongoCheckout checkoutUrl={state.redirectUrl} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="publicId" value={publicId} />

      {state.message && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
          {state.message}
        </p>
      )}
      {state.success && (
        <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
          {state.success}
        </p>
      )}

      <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
        Pay with QR Ph, card, GCash or Maya on PayMongo&apos;s secure hosted
        checkout. Payment details never pass through Bunal.club.
      </p>

      <Button type="submit" disabled={pending} className="rounded-2xl py-4">
        {pending ? "Taking you to PayMongo…" : `Pay ${formatPHP(amount)}`}
      </Button>

      <p className="text-center text-xs text-slate-400">
        The registration fee goes directly to {venueName}.
      </p>
    </form>
  );
}
