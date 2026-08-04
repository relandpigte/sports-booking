"use client";

import type { FormEvent } from "react";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  deleteCancelledEventAction,
  type EventFormState,
} from "@/lib/event-actions";

const initialState: EventFormState = {};

export function DeleteCancelledEventButton({
  eventId,
  title,
}: {
  eventId: string;
  title: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    deleteCancelledEventAction,
    initialState
  );

  useEffect(() => {
    if (state.success) router.push("/dashboard/events");
  }, [router, state.success]);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (
      !window.confirm(
        `Delete cancelled event "${title}"? This cannot be undone.`
      )
    ) {
      event.preventDefault();
    }
  }

  return (
    <div className="text-right">
      <form action={formAction} onSubmit={confirmDelete}>
        <input type="hidden" name="eventId" value={eventId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </form>
      {state.message ? (
        <p className="mt-1 max-w-64 text-xs text-red-600" role="alert">
          {state.message}
        </p>
      ) : state.success ? (
        <p className="mt-1 max-w-64 text-xs text-emerald-700" role="status">
          {state.success}
        </p>
      ) : null}
    </div>
  );
}
