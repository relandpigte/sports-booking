import type { Metadata } from "next";
import Link from "next/link";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/Badge";
import { requireActivePartner } from "@/lib/dal";
import { listMyEvents } from "@/lib/events";
import { formatManilaDate, formatSlotRange, manilaToday } from "@/lib/time";

export const metadata: Metadata = { title: "Events — Bunal.club" };

const tabs = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
] as const;

type View = (typeof tabs)[number]["value"];

export default async function OwnerEventsPage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const partner = await requireActivePartner();
  const query = await searchParams;
  const requested = Array.isArray(query.view) ? query.view[0] : query.view;
  const view: View = tabs.some((tab) => tab.value === requested) ? requested as View : "today";
  const today = manilaToday();
  const allEvents = await listMyEvents(partner.id);
  const events = allEvents
    .filter((event) => view === "today" ? event.date === today : view === "upcoming" ? event.date > today : event.date < today)
    .sort((left, right) => view === "past" ? right.startsAt.getTime() - left.startsAt.getTime() : left.startsAt.getTime() - right.startsAt.getTime());

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Open play management"
        title="Events"
        description="Create open play sessions, protect court time, and manage player registrations in one place."
        actions={<Link href="/dashboard/events/new" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-black text-white hover:bg-primary-hover">+ Create event</Link>}
      />

      <nav className="mt-7 inline-flex rounded-2xl border border-slate-200 bg-white p-1" aria-label="Event periods">
        {tabs.map((tab) => <Link key={tab.value} href={`/dashboard/events?view=${tab.value}`} className={`rounded-xl px-4 py-2 text-sm font-bold ${view === tab.value ? "bg-navy text-white" : "text-slate-500 hover:bg-slate-50"}`}>{tab.label}</Link>)}
      </nav>

      {events.length ? (
        <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[1.5fr_1fr_0.7fr_auto] gap-4 border-b border-slate-100 px-6 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400 sm:grid">
            <span>Event</span><span>Schedule</span><span>Status</span><span>Actions</span>
          </div>
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <article key={event.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[1.5fr_1fr_0.7fr_auto] sm:items-center sm:px-6">
                <div className="min-w-0">
                  <h2 className="truncate font-black text-navy">{event.title}</h2>
                  <p className="mt-1 truncate text-xs text-slate-500">{event.hub.name} · {event.courts.map((court) => court.name).join(", ")}</p>
                </div>
                <div><p className="text-sm font-bold text-navy">{formatManilaDate(event.date)}</p><p className="mt-1 text-xs text-slate-500">{formatSlotRange(event.startHour, event.endHour)}</p></div>
                <Badge tone={event.status === "PUBLISHED" ? "primary" : event.status === "DRAFT" ? "neutral" : "danger"} className="w-fit">{event.status}</Badge>
                <div className="flex flex-wrap items-start gap-2 sm:justify-end"><Link href={`/events/${event.publicId}`} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Public page</Link><Link href={`/dashboard/events/${event.publicId}`} className="rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15">Event details</Link></div>
              </article>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><h2 className="text-lg font-black text-navy">No {view} events</h2><p className="mt-2 text-sm text-slate-500">Create an open play session and invite your court community.</p><Link href="/dashboard/events/new" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Create event</Link></div>
      )}
    </div>
  );
}
