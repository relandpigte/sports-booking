"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { createQuickQueueAction } from "@/lib/open-play-actions";
import {
  OPEN_PLAY_MODE_DESCRIPTIONS,
  OPEN_PLAY_MODE_LABELS,
  OPEN_PLAY_MODES,
} from "@/lib/open-play-shared";

type HubOption = { id: string; name: string; courts: { id: string; name: string }[] };

export function QuickQueueForm({ hubs }: { hubs: HubOption[] }) {
  const [state, action, pending] = useActionState(createQuickQueueAction, {});
  const [hubId, setHubId] = useState(hubs[0]?.id ?? "");
  const [mode, setMode] = useState("BALANCED");
  const courts = useMemo(() => hubs.find((hub) => hub.id === hubId)?.courts ?? [], [hubId, hubs]);
  return (
    <form action={action} className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-navy">Queue details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-slate-700">Name<input name="title" required maxLength={120} placeholder="Friday night BunalQ" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></label>
          <label className="text-sm font-bold text-slate-700">Hub<select name="hubId" value={hubId} onChange={(event) => setHubId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm">{hubs.map((hub) => <option key={hub.id} value={hub.id}>{hub.name}</option>)}</select></label>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-black text-navy">Courts</legend>
          <div className="mt-2 flex flex-wrap gap-2">{courts.map((court) => <label key={court.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-navy"><input type="checkbox" name="courtId" value={court.id} defaultChecked />{court.name}</label>)}</div>
          {courts.length === 0 ? <p className="mt-2 text-sm text-red-600">This hub has no courts.</p> : null}
        </fieldset>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-navy">Matching mode</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{OPEN_PLAY_MODES.map((value) => <label key={value} className={`cursor-pointer rounded-xl border p-3 ${mode === value ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-slate-200"}`}><input className="sr-only" type="radio" name="matchingMode" value={value} checked={mode === value} onChange={() => setMode(value)} /><span className="text-sm font-black text-navy">{OPEN_PLAY_MODE_LABELS[value]}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{OPEN_PLAY_MODE_DESCRIPTIONS[value]}</span></label>)}</div>
      </section>
      <section className="rounded-2xl border border-ocean/20 bg-ocean-soft p-5">
        <h2 className="font-black text-navy">Public guest entry</h2>
        <p className="mt-1 text-sm text-slate-600">Players join from the QR link without creating an account.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="cursor-pointer rounded-xl border border-primary bg-white p-3"><input type="radio" name="admissionMode" value="APPROVAL_REQUIRED" defaultChecked /> <span className="ml-2 text-sm font-black text-navy">Organizer approval</span><span className="mt-1 block pl-6 text-xs text-slate-500">Safer default for a publicly shared link.</span></label>
          <label className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3"><input type="radio" name="admissionMode" value="INSTANT" /> <span className="ml-2 text-sm font-black text-navy">Instant entry</span><span className="mt-1 block pl-6 text-xs text-slate-500">Players enter the active wait list immediately.</span></label>
        </div>
      </section>
      {state.message ? <p role="alert" className="text-sm font-bold text-red-600">{state.message}</p> : null}
      <Button disabled={pending || courts.length === 0}>{pending ? "Starting BunalQ…" : "Start Quick Queue"}</Button>
    </form>
  );
}
