import type { Metadata } from "next";
import Link from "next/link";

import { EventForm } from "@/components/events/EventForm";
import { listEventFormHubs } from "@/lib/events";
import { manilaToday } from "@/lib/time";
import { requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = { title: "Create Event — Bunal.club" };

export default async function NewEventPage() {
  const workspace = await requirePartnerWorkspace("events", "MANAGE");
  const hubs = await listEventFormHubs(workspace.partnerId);
  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link href="/dashboard/events" className="text-sm font-bold text-primary hover:underline">← Back to events</Link>
      <header className="mt-5"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">New open play</p><h1 className="mt-2 text-3xl font-black tracking-tight text-navy">Create an event</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Set the schedule, reserve courts, choose capacity, and publish registration for players.</p></header>
      {hubs.length ? <div className="mt-7"><EventForm hubs={hubs} today={manilaToday()} /></div> : <div className="mt-7 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 className="text-lg font-black text-navy">Add a court first</h2><p className="mt-2 text-sm text-slate-500">An event needs at least one court at one of your hubs.</p><Link href="/dashboard/hubs/new" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Create a hub</Link></div>}
    </div>
  );
}
