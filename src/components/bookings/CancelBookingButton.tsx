"use client";

import { useActionState, useState } from "react";

import { Textarea } from "@/components/ui/Textarea";
import {
  cancelHubBookingAction,
  cancelMyBookingAction,
  type BookingFormState,
} from "@/lib/booking-actions";

const initialState: BookingFormState = {};

// `player` cancels their own booking; `partner` declines someone else's and
// must give a reason the player will see.
export function CancelBookingButton({
  bookingId,
  variant,
}: {
  bookingId: string;
  variant: "player" | "partner";
}) {
  const action =
    variant === "player" ? cancelMyBookingAction : cancelHubBookingAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [open, setOpen] = useState(false);

  if (state.success) {
    return (
      <p role="status" className="text-xs font-medium text-green-700">
        {state.success}
      </p>
    );
  }

  if (variant === "partner" && !open) {
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
    <form
      action={formAction}
      noValidate
      className="flex flex-col items-end gap-2"
      onSubmit={(e) => {
        if (
          variant === "player" &&
          !window.confirm("Cancel this booking? This cannot be undone.")
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={bookingId} />

      {variant === "partner" && (
        <div className="w-full sm:w-72">
          <Textarea
            label="Reason for the player"
            name="reason"
            rows={2}
            error={state.errors?.reason}
          />
        </div>
      )}

      {state.message && (
        <p role="alert" className="text-xs text-red-600">
          {state.message}
        </p>
      )}

      <div className="flex items-center gap-2">
        {variant === "partner" && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
          >
            Keep
          </button>
        )}
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
