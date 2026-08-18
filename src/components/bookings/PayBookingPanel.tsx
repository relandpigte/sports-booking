"use client";

import { useActionState } from "react";

import { PayMongoCheckout } from "@/components/bookings/PayMongoCheckout";
import { PaymentStatusPoller } from "@/components/bookings/PaymentStatusPoller";
import { CancelBookingHoldButton } from "@/components/bookings/CancelBookingHoldButton";
import { Button } from "@/components/ui/Button";
import { usePwa } from "@/components/pwa/PwaProvider";
import {
  payForBookingAction,
  type PayBookingFormState,
} from "@/lib/booking-payment-actions";
import { formatPHP } from "@/lib/currency";

const initial: PayBookingFormState = {};

// One button creates the one-time PayMongo checkout. The player can open it on
// this device or scan its QR on another device; no payment details pass through
// this app.
export function PayBookingPanel({
  paymentId,
  amount,
  venueName,
  expiresAt,
  initialSeconds,
}: {
  paymentId: string;
  amount: number;
  venueName: string;
  expiresAt: string;
  initialSeconds: number;
}) {
  const [state, formAction, pending] = useActionState(
    payForBookingAction,
    initial
  );
  const { isOnline } = usePwa();

  if (state.qrImageUrl || state.redirectUrl) {
    return (
      <div className="space-y-3">
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
        />
        <CancelBookingHoldButton paymentId={paymentId} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
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
          Pay by <span className="font-medium text-gray-900">QR Ph</span> through
          PayMongo. The exact-amount code appears here and confirms automatically.
        </p>

        <Button type="submit" disabled={pending || !isOnline}>
          {!isOnline
            ? "Reconnect to pay"
            : pending
              ? "Preparing QR Ph…"
              : `Retry QR Ph payment · ${formatPHP(amount)}`}
        </Button>

        <p className="text-center text-xs text-gray-400">
          The court fee goes directly to {venueName}.
        </p>
      </form>
      <CancelBookingHoldButton paymentId={paymentId} />
    </div>
  );
}
