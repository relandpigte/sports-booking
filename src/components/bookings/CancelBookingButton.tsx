"use client";

import { useActionState, useState } from "react";

import { Textarea } from "@/components/ui/Textarea";
import {
  cancelHubBookingAction,
  type BookingFormState,
} from "@/lib/booking-actions";

const initialState: BookingFormState = {};

// Venue-side cancellation. Players can't cancel their own bookings — the venue
// is holding the court for them, so releasing it is the venue's decision.
// A reason is required, since the player finds out after the fact.
export function CancelBookingButton({
  bookingId,
  // The player paid online, so cancelling is also a decision about their money.
  // Nothing is refunded unless the venue says so.
  paid = false,
  amountLabel,
}: {
  bookingId: string;
  paid?: boolean;
  amountLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    cancelHubBookingAction,
    initialState
  );
  const [open, setOpen] = useState(false);
  const [refund, setRefund] = useState(true);

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
        onClick={() => setOpen(true)}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
      >
        Cancel booking
      </button>
    );
  }

  return (
    <form action={formAction} noValidate className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={bookingId} />

      <div className="w-full sm:w-72">
        <Textarea
          label="Reason for the player"
          name="reason"
          rows={2}
          error={state.errors?.reason}
        />
      </div>

      {paid && (
        <label className="flex w-full items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 sm:w-72">
          <input
            type="checkbox"
            name="refund"
            value="full"
            checked={refund}
            onChange={(e) => setRefund(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Refund {amountLabel ?? "the payment"} in full. The money goes back
            from your gateway, not from Bunal.ph.
          </span>
        </label>
      )}

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
          disabled={pending}
          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          {pending ? "Cancelling…" : "Cancel booking"}
        </button>
      </div>
    </form>
  );
}
