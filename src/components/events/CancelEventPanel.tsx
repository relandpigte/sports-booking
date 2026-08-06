"use client";

import { useActionState, useState } from "react";

import { cancelEventAction, type EventFormState } from "@/lib/event-actions";

const initialState: EventFormState = {};

export function CancelEventPanel({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(cancelEventAction, initialState);

  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="text-sm font-bold text-red-600 hover:underline">Cancel event</button>;
  }

  return (
    <form action={action} className="rounded-2xl border border-red-200 bg-red-50 p-5">
      <input type="hidden" name="eventId" value={eventId} />
      <h3 className="font-black text-red-900">Cancel this event?</h3>
      <p className="mt-1 text-sm leading-6 text-red-700">Court hours are released immediately. Successful payments have their refundable amount returned by default; Bunal.club service fees remain charged.</p>
      <textarea name="reason" required minLength={3} rows={3} className="mt-4 w-full rounded-xl border border-red-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-red-400" placeholder="Tell registered players why the event is cancelled." />
      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-red-800"><input type="checkbox" name="refund" value="full" defaultChecked className="accent-red-600" /> Refund successful payments (excluding service fees)</label>
      {(state.message || state.errors?.reason) && <p className="mt-3 text-sm font-medium text-red-700">{state.message ?? state.errors?.reason}</p>}
      {state.success && <p className="mt-3 text-sm font-medium text-emerald-700">{state.success}</p>}
      <div className="mt-4 flex gap-2">
        <button disabled={pending} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{pending ? "Cancelling…" : "Confirm cancellation"}</button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-white">Keep event</button>
      </div>
    </form>
  );
}
