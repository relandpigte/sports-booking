"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useBunalQActionState } from "@/hooks/useBunalQActionState";
import { createGuestQuickQueueAction } from "@/lib/open-play-actions";
import {
  OPEN_PLAY_MODE_DESCRIPTIONS,
  OPEN_PLAY_MODE_LABELS,
  OPEN_PLAY_MODES,
} from "@/lib/open-play-shared";

export function GuestQuickQueueForm() {
  const [state, action, pending] = useBunalQActionState(
    createGuestQuickQueueAction
  );
  const [mode, setMode] = useState("BALANCED");

  return (
    <form action={action} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-navy">Queue details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">
            BunalQ name
            <input
              name="title"
              required
              minLength={2}
              maxLength={120}
              placeholder="Friday night BunalQ"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm"
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Number of courts
            <select
              name="courtCount"
              defaultValue="1"
              className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map(
                (count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? "court" : "courts"}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Courts are created as Court 1, Court 2, and so on. This does not
          create a venue listing or booking schedule.
        </p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-navy">Matching mode</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-5">
          {OPEN_PLAY_MODES.map((value) => (
            <label
              key={value}
              className={`cursor-pointer rounded-xl border p-3 ${
                mode === value
                  ? "border-primary bg-primary-soft ring-1 ring-primary"
                  : "border-slate-200"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="matchingMode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span className="text-sm font-black text-navy">
                {OPEN_PLAY_MODE_LABELS[value]}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                {OPEN_PLAY_MODE_DESCRIPTIONS[value]}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-ocean/20 bg-ocean-soft p-5">
        <h2 className="font-black text-navy">Public guest entry</h2>
        <p className="mt-1 text-sm text-slate-600">
          Players can join from your public QR link without creating an
          account.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="cursor-pointer rounded-xl border border-primary bg-white p-3">
            <input
              type="radio"
              name="admissionMode"
              value="APPROVAL_REQUIRED"
              defaultChecked
            />
            <span className="ml-2 text-sm font-black text-navy">
              Organizer approval
            </span>
            <span className="mt-1 block pl-6 text-xs text-slate-500">
              Review each player before adding them to the wait list.
            </span>
          </label>
          <label className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3">
            <input type="radio" name="admissionMode" value="INSTANT" />
            <span className="ml-2 text-sm font-black text-navy">
              Instant entry
            </span>
            <span className="mt-1 block pl-6 text-xs text-slate-500">
              Players enter the active wait list immediately.
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-black text-amber-900">
          This browser is your organizer key
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800">
          There is no account, recovery email, link, or passcode. Clearing this
          browser&apos;s data permanently removes your organizer access. Ended
          guest queues are deleted after 24 hours.
        </p>
      </section>

      {state.message ? (
        <p role="alert" className="text-sm font-bold text-red-600">
          {state.message}
        </p>
      ) : null}
      {state.reloadRequired ? (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-10 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-700"
        >
          Reload page
        </button>
      ) : null}
      <Button disabled={pending}>
        {pending ? "Creating BunalQ…" : "Create public BunalQ"}
      </Button>
    </form>
  );
}
