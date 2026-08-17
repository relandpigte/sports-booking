import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpenPlayBoard } from "@/components/open-play/OpenPlayBoard";
import { OpenPlayLiveRefresh } from "@/components/open-play/OpenPlayLiveRefresh";
import { PageShell } from "@/components/PageShell";
import { getPublicEvent } from "@/lib/events";
import { getPublicOpenPlaySnapshot } from "@/lib/open-play";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "Live Open Play — Bunal.club" };

export default async function PublicOpenPlayPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const [event, snapshot] = await Promise.all([
    getPublicEvent(publicId),
    getPublicOpenPlaySnapshot(publicId),
  ]);
  if (!event) notFound();

  return (
    <PageShell maxWidth="max-w-7xl">
      <OpenPlayLiveRefresh publicId={publicId} />
      <div className="py-6 sm:py-10">
        <Link href={`/events/${publicId}`} className="text-sm font-bold text-primary hover:underline">
          ← Event page
        </Link>
        <header className="my-5 rounded-3xl bg-navy p-6 text-white sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">Live queue</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{event.title}</h1>
          <p className="mt-2 text-sm text-white/65">
            {event.hub.name} · {formatManilaDateLong(event.date)} · {formatSlotRange(event.startHour, event.endHour)}
          </p>
        </header>
        {snapshot ? (
          <OpenPlayBoard snapshot={snapshot} />
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
            The organizer has not opened the live queue yet.
          </p>
        )}
      </div>
    </PageShell>
  );
}
