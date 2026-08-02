import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { EventCard } from "@/components/events/EventCard";
import { listPublicEvents } from "@/lib/events";

export const metadata: Metadata = {
  title: "Open Play Events in Bohol — Bunal.club",
  description:
    "Browse today's and upcoming open play sessions hosted by Bunal.club venue partners.",
};

const tabs = [
  { value: "today", label: "Today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
] as const;

type EventView = (typeof tabs)[number]["value"];

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const query = await searchParams;
  const requested = Array.isArray(query.view) ? query.view[0] : query.view;
  const view: EventView = tabs.some((tab) => tab.value === requested)
    ? (requested as EventView)
    : "today";
  const events = await listPublicEvents(view);

  return (
    <PageShell maxWidth="max-w-7xl">
      <div className="py-10 sm:py-14">
        <header className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Play · compete · connect
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-navy sm:text-5xl">
            Events
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-500 sm:text-lg">
            Browse open play sessions hosted by Bohol&apos;s court communities.
            View every event publicly, then sign in as a player when you&apos;re
            ready to join.
          </p>
        </header>

        <nav className="mt-8 inline-flex rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm" aria-label="Event periods">
          {tabs.map((tab) => {
            const active = tab.value === view;
            return (
              <Link
                key={tab.value}
                href={`/events?view=${tab.value}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors sm:px-6 ${
                  active
                    ? "bg-navy text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-50 hover:text-navy"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {events.length > 0 ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            {events.map((event) => (
              <EventCard key={event.id} event={event} past={view === "past"} />
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 11h18" />
              </svg>
            </div>
            <h2 className="mt-5 text-xl font-black text-navy">
              No {view} events yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Hub owners are setting up new open plays. Check the other event
              periods or come back soon.
            </p>
            {view !== "upcoming" && (
              <Link
                href="/events?view=upcoming"
                className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                Browse upcoming events
              </Link>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}
