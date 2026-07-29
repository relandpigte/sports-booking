"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RadioCards } from "@/components/ui/RadioCards";
import {
  payForBookingAction,
  type PayBookingFormState,
} from "@/lib/booking-payment-actions";
import { BOOKING_PAYMENT_METHODS } from "@/lib/constants";
import { formatPHP } from "@/lib/currency";

const initial: PayBookingFormState = {};

export function PayBookingPanel({
  paymentId,
  amount,
  venueName,
}: {
  paymentId: string;
  amount: number;
  venueName: string;
}) {
  const [method, setMethod] = useState<string>("CARD");
  const [state, formAction, pending] = useActionState(
    payForBookingAction,
    initial
  );

  // The gateway wants the payer to approve somewhere else. Sending the browser
  // there is the whole point of the redirect leg — the hold keeps running
  // while they're away, and the return URL comes straight back here.
  useEffect(() => {
    if (state.redirectUrl) window.location.href = state.redirectUrl;
  }, [state.redirectUrl]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
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

      <RadioCards
        name="method"
        value={method}
        onChange={setMethod}
        error={state.errors?.method}
        options={BOOKING_PAYMENT_METHODS.map((m) => ({
          value: m.value,
          label: m.label,
        }))}
      />

      {method === "CARD" && (
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 p-4">
          <Input
            label="Name on card"
            name="cardName"
            autoComplete="cc-name"
            error={state.errors?.cardName}
          />
          <Input
            label="Card number"
            name="cardNumber"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="4242 4242 4242 4242"
            error={state.errors?.cardNumber}
          />
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Month"
              name="cardExpMonth"
              inputMode="numeric"
              placeholder="12"
              error={state.errors?.cardExpMonth}
            />
            <Input
              label="Year"
              name="cardExpYear"
              inputMode="numeric"
              placeholder="2030"
              error={state.errors?.cardExpYear}
            />
            <Input
              label="CVC"
              name="cardCvc"
              inputMode="numeric"
              autoComplete="cc-csc"
              placeholder="123"
              error={state.errors?.cardCvc}
            />
          </div>
        </div>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Paying…" : `Pay ${formatPHP(amount)}`}
      </Button>

      <p className="text-center text-xs text-gray-400">
        This payment goes directly to {venueName}. Sports 360 takes no cut.
      </p>
    </form>
  );
}
