"use client";

import { useActionState, useState } from "react";

import {
  refundBookingAction,
  type BookingFormState,
} from "@/lib/booking-actions";
import { usePwa } from "@/components/pwa/PwaProvider";

const initialState: BookingFormState = {};

// Refunding on its own, for the two cases the cancel dialog doesn't cover: the
// venue kept the booking but wants to give the money back, and the retry after
// a refund failed at the gateway.
export function RefundBookingButton({
  bookingId,
  amountLabel,
}: {
  bookingId: string;
  amountLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    refundBookingAction,
    initialState
  );
  const [open, setOpen] = useState(false);
  const { isOnline } = usePwa();

  if (state.success) {
    return (
      <p role="status" className="text-xs font-medium text-green-700">
        {state.success}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={!isOnline}
        title={!isOnline ? "Reconnect to refund this payment." : undefined}
        onClick={() => setOpen(true)}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Refund {amountLabel ?? "payment"}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={bookingId} />
      <input type="hidden" name="reason" value="Refunded by the venue." />

      {state.message && (
        <p role="alert" className="text-xs text-red-600">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
        >
          Keep
        </button>
        <button
          type="submit"
          disabled={pending || !isOnline}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {pending
            ? "Refunding…"
            : `Refund ${amountLabel ?? "booking subtotal"}`}
        </button>
      </div>
    </form>
  );
}
