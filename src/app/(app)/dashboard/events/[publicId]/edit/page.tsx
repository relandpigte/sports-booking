import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CancelEventPanel } from "@/components/events/CancelEventPanel";
import { EventForm } from "@/components/events/EventForm";
import { OwnerEventRegistrations } from "@/components/events/OwnerEventRegistrations";
import { requireActivePartner } from "@/lib/dal";
import { getEventEditor, listEventFormHubs, listOwnerEventRegistrations } from "@/lib/events";
import { manilaToday } from "@/lib/time";

export const metadata: Metadata = { title: "Manage Event — Bunal.club" };

export default async function EditEventPage({ params }: { params: Promise<{ publicId: string }> }) {
  const partner = await requireActivePartner();
  const { publicId } = await params;
  const [event, hubs] = await Promise.all([getEventEditor(publicId, partner.id), listEventFormHubs(partner.id)]);
  if (!event) notFound();
  const registrations = await listOwnerEventRegistrations(event.id, partner.id);
  if (!registrations) notFound();
  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/dashboard/events" className="text-sm font-bold text-primary hover:underline">← Back to events</Link><Link href={`/events/${event.publicId}`} target="_blank" className="text-sm font-bold text-navy hover:underline">View public page ↗</Link></div>
      <header className="mt-5"><p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Event management</p><h1 className="mt-2 text-3xl font-black tracking-tight text-navy">Edit {event.title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">Update the public details and manage every player registration.</p></header>
      <div className="mt-7"><EventForm hubs={hubs} event={event} today={manilaToday()} /></div>
      <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 sm:p-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary">Players</p><h2 className="mt-2 text-2xl font-black text-navy">Registrations</h2></div><span className="text-sm font-bold text-slate-500">{registrations.length} total</span></div><div className="mt-5"><OwnerEventRegistrations registrations={registrations} /></div></section>
      {event.status !== "CANCELLED" && <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 sm:p-8"><h2 className="text-lg font-black text-navy">Event controls</h2><p className="mt-1 mb-5 text-sm text-slate-500">Cancellation releases every selected court-hour and can refund successful player payments.</p><CancelEventPanel eventId={event.id} /></section>}
    </div>
  );
}
