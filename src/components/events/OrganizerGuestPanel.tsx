"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  addOrganizerEventGuestsAction,
  type EventFormState,
} from "@/lib/event-actions";

const initialState: EventFormState = {};

export function OrganizerGuestPanel({
  eventId,
  remainingSpots,
}: {
  eventId: string;
  remainingSpots: number;
}) {
  const nextRowId = useRef(2);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([{ id: 1 }]);
  const [state, action, pending] = useActionState(
    async (previous: EventFormState, formData: FormData) => {
      const result = await addOrganizerEventGuestsAction(previous, formData);
      if (result.success) {
        setOpen(false);
        setRows([{ id: nextRowId.current++ }]);
      }
      return result;
    },
    initialState
  );
  const maxGuests = Math.min(50, remainingSpots);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, pending]);

  function addRow() {
    if (rows.length >= maxGuests) return;
    setRows((current) => [...current, { id: nextRowId.current++ }]);
  }

  function removeRow(id: number) {
    if (rows.length === 1) return;
    setRows((current) => current.filter((row) => row.id !== id));
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
            Remaining capacity
          </p>
          <p className="text-sm font-bold text-navy">
            {remainingSpots} {remainingSpots === 1 ? "spot" : "spots"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={remainingSpots === 0}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          <span aria-hidden className="text-lg leading-none">
            +
          </span>
          Add player
        </button>
      </div>
      {state.success ? (
        <p className="text-xs font-medium text-emerald-700">{state.success}</p>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-navy/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="organizer-guest-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-5 text-left shadow-2xl shadow-navy/20 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="organizer-guest-title" className="text-xl font-black text-navy">
                  Add complimentary players
                </h3>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {remainingSpots} {remainingSpots === 1 ? "spot" : "spots"} remaining
                </p>
              </div>
              <button
                type="button"
                aria-label="Close add guest dialog"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xl text-slate-400 hover:bg-slate-100 hover:text-navy disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <form action={action} className="mt-6 space-y-4">
              <input type="hidden" name="eventId" value={eventId} />
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={row.id}>
                    <label
                      htmlFor={`organizer-guest-${row.id}`}
                      className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500"
                    >
                      Player {index + 1} name
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id={`organizer-guest-${row.id}`}
                        name="guestName"
                        required
                        maxLength={80}
                        autoFocus={index === 0}
                        placeholder="Full name"
                        className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-navy outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      />
                      <button
                        type="button"
                        aria-label={`Remove player ${index + 1}`}
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length === 1 || pending}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-red-100 text-lg text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:border-slate-100 disabled:text-slate-300"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {rows.length < maxGuests ? (
                <button
                  type="button"
                  onClick={addRow}
                  disabled={pending}
                  className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary hover:underline disabled:opacity-50"
                >
                  <span aria-hidden>＋</span>
                  Add another player
                </button>
              ) : null}

              <div className="rounded-2xl bg-primary-soft p-4">
                <p className="text-sm font-bold text-primary">
                  Complimentary registration
                </p>
                <p className="mt-1 text-xs leading-5 text-primary-hover">
                  No registration or payment fee is charged. Players consume
                  capacity immediately.
                </p>
              </div>

              {state.message ? (
                <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {state.message}
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="min-h-12 rounded-xl border border-slate-200 text-sm font-bold text-navy transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  disabled={pending}
                  className="min-h-12 rounded-xl bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-wait disabled:opacity-60"
                >
                  {pending
                    ? "Adding…"
                    : `Confirm ${rows.length} ${rows.length === 1 ? "player" : "players"}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
