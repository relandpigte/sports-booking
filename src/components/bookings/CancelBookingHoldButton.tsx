"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import { usePwa } from "@/components/pwa/PwaProvider";
import {
  releaseBookingHoldAction,
  type HeldBookingActionState,
} from "@/lib/booking-payment-actions";

const initialState: HeldBookingActionState = {};

export function CancelBookingHoldButton({
  paymentId,
  label = "Cancel reservation and free slots",
  confirmation =
    "Cancel this reservation? The selected court slots will immediately become available to other players.",
}: {
  paymentId: string;
  label?: string;
  confirmation?: string;
}) {
  const router = useRouter();
  const { isOnline } = usePwa();
  const [state, action, pending] = useActionState(
    releaseBookingHoldAction,
    initialState
  );

  useEffect(() => {
    if (!state.released) return;
    if (state.redirectTo) {
      router.replace(state.redirectTo);
      return;
    }
    router.refresh();
  }, [router, state.redirectTo, state.released]);

  return (
    <div className="space-y-2">
      {state.message && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}
      <form
        action={action}
        onSubmit={(event) => {
          if (!window.confirm(confirmation)) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="paymentId" value={paymentId} />
        <button
          type="submit"
          disabled={pending || !isOnline}
          className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!isOnline ? "Reconnect to cancel" : pending ? "Cancelling…" : label}
        </button>
      </form>
    </div>
  );
}
