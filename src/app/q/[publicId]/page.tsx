import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OpenPlayBoard } from "@/components/open-play/OpenPlayBoard";
import { OpenPlayLiveRefresh } from "@/components/open-play/OpenPlayLiveRefresh";
import { PublicQueueJoinForm } from "@/components/open-play/PublicQueueJoinForm";
import { PageShell } from "@/components/PageShell";
import { getPublicOpenPlaySnapshot } from "@/lib/open-play";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "BunalQ live board — Bunal.club" };

export default async function PublicBunalQPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const snapshot = await getPublicOpenPlaySnapshot(publicId);
  if (!snapshot) notFound();
  const event = snapshot.queue.event;
  return (
    <PageShell maxWidth="max-w-7xl">
      <OpenPlayLiveRefresh publicId={snapshot.queue.publicId} />
      <div className="py-6 sm:py-10">
        {event ? <Link href={`/events/${event.publicId}`} className="text-sm font-bold text-primary">← Event page</Link> : <Link href="/hubs" className="text-sm font-bold text-primary">← Browse hubs</Link>}
        <header className="my-5 rounded-3xl bg-navy p-5 text-white sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">BunalQ · Live court rotation</p><h1 className="mt-2 text-3xl font-black">{snapshot.queue.title}</h1><p className="mt-2 text-sm text-white/65">{snapshot.queue.hub.name}{event ? ` · ${formatManilaDateLong(event.date)} · ${formatSlotRange(event.startHour, event.endHour)}` : " · Quick Queue"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${snapshot.status === "ACTIVE" ? "bg-primary" : "bg-white/10"}`}>{snapshot.status}</span></div></header>
        <div className={`grid gap-5 ${snapshot.queue.kind === "QUICK" && snapshot.status === "ACTIVE" ? "lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start" : ""}`}><OpenPlayBoard snapshot={snapshot} />{snapshot.queue.kind === "QUICK" && snapshot.status === "ACTIVE" ? <PublicQueueJoinForm publicId={snapshot.queue.publicId} approvalRequired={snapshot.queue.admissionMode === "APPROVAL_REQUIRED"} /> : null}</div>
      </div>
    </PageShell>
  );
}
