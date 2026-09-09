import type { Metadata } from "next";
import Link from "next/link";

import { PageShell } from "@/components/PageShell";
import { listPublicBunalQQueues } from "@/lib/open-play";
import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  absoluteUrl,
} from "@/lib/site";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = {
  title: "Live BunalQ Court Rotations | Bunal.club",
  description:
    "Follow live BunalQ court rotations, upcoming matchups, waiting players, and results from pickleball communities across the Philippines.",
  alternates: { canonical: absoluteUrl("/bunalq") },
  openGraph: {
    title: "Live BunalQ Court Rotations | Bunal.club",
    description:
      "See active courts, upcoming matches, waiting players, and results on public BunalQ boards.",
    url: absoluteUrl("/bunalq"),
    siteName: SITE_NAME,
    images: [DEFAULT_SOCIAL_IMAGE],
    locale: "en_PH",
    type: "website",
  },
};

export default async function PublicBunalQDirectoryPage() {
  const queues = await listPublicBunalQQueues();

  return (
    <PageShell maxWidth="max-w-7xl">
      <div className="py-8 sm:py-14">
        <header className="max-w-3xl">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
            Live court rotation
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] text-navy sm:text-5xl">
            BunalQ
          </h1>
          <p className="mt-3 text-base leading-7 text-slate-500 sm:text-lg">
            Follow active courts, see who is up next, and join public Quick
            Queues from any device—no account needed to view.
          </p>
          <Link
            href="/bunalq/new"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover"
          >
            Create a public BunalQ
          </Link>
          <Link
            href="/bunalq/new"
            className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-black text-white transition hover:bg-primary-hover"
          >
            Create a BunalQ
          </Link>
        </header>

        {queues.length > 0 ? (
          <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {queues.map((queue) => {
              const run = queue.sessions[0];
              return (
                <Link
                  key={queue.publicId}
                  href={`/q/${queue.publicId}`}
                  className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                    <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-primary">
                      {queue.kind === "QUICK" ? "Quick Queue" : "Event"}
                    </span>
                    <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                      Live
                    </span>
                  </div>
                  <div className="p-5">
                    <h2 className="text-lg font-black text-navy transition-colors group-hover:text-primary">
                      {queue.title}
                    </h2>
                    <p className="mt-1 text-sm font-bold text-slate-600">
                      {queue.hub.name}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {queue.event
                        ? `${formatManilaDateLong(queue.event.date)} · ${formatSlotRange(queue.event.startHour, queue.event.endHour)}`
                        : queue.hub.address ?? "Public Quick Queue"}
                    </p>
                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs font-bold text-slate-500">
                      <span>
                        {run?._count.courts ?? 0} courts · {run?._count.participants ?? 0} players
                      </span>
                      <span className="text-primary">Open live board →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-2xl text-primary">
              ↻
            </div>
            <h2 className="mt-5 text-xl font-black text-navy">
              No live BunalQ rooms right now
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Active public rotations will appear here automatically. You can
              create an unlisted queue now or browse upcoming open play events.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/bunalq/new" className="inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover">Create a BunalQ</Link>
              <Link href="/events" className="inline-flex rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:bg-slate-50">Browse events</Link>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  );
}
