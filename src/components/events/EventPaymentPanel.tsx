"use client";

import { useActionState } from "react";

import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { PaymentStatusPoller } from "@/components/bookings/PaymentStatusPoller";
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
  expiresAt,
  initialSeconds,
  statusBasePath,
}: {
  paymentId: string;
  publicId: string;
  amount: number;
  venueName: string;
  expiresAt: string;
  initialSeconds: number;
  statusBasePath?: string;
}) {
  const [state, formAction, pending] = useActionState(
    payForEventAction,
    initialState
  );

  if (state.qrImageUrl || state.redirectUrl) {
    return (
      <>
        <PayMongoCheckout
          qrImageUrl={state.qrImageUrl}
          checkoutUrl={state.redirectUrl}
          expiresAt={expiresAt}
          initialSeconds={initialSeconds}
        />
        <PaymentStatusPoller
          paymentId={paymentId}
          initialStatus="PENDING"
          initialChargeInFlight
          statusBasePath={statusBasePath}
        />
      </>
    );
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
        Pay with PayMongo&apos;s secure, exact-amount QR Ph code. Confirmation
        happens automatically and payment details never pass through Bunal.club.
      </p>

      <Button type="submit" disabled={pending} className="rounded-2xl py-4">
        {pending
          ? "Preparing QR Ph…"
          : `Retry QR Ph payment · ${formatPHP(amount)}`}
      </Button>

      <p className="text-center text-xs text-slate-400">
        The registration fee goes directly to {venueName}.
      </p>
    </form>
  );
}
