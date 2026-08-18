import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PrepareOpenPlay } from "@/components/open-play/OpenPlayConsole";
import { getOpenPlayEvent, getOpenPlayWorkspace } from "@/lib/open-play";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "Prepare BunalQ — Bunal.club" };

export default async function EventBunalQPage({ params }: { params: Promise<{ publicId: string }> }) {
  const workspace = await getOpenPlayWorkspace("VIEW");
  if (!workspace) redirect("/dashboard/partner?access=denied");
  const { publicId } = await params;
  const event = await getOpenPlayEvent(publicId, workspace.partnerId);
  if (!event) notFound();
  if (event.openPlayQueue) redirect(`/dashboard/bunalq/${event.openPlayQueue.publicId}`);
  return <div className="mx-auto w-full max-w-4xl"><Link href={`/dashboard/events/${publicId}`} className="text-sm font-bold text-primary">← Event details</Link><header className="my-5 rounded-3xl bg-navy p-6 text-white"><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">BunalQ · Live court rotation</p><h1 className="mt-2 text-3xl font-black">{event.title}</h1><p className="mt-2 text-sm text-white/65">{event.hub.name} · {formatManilaDateLong(event.date)} · {formatSlotRange(event.startHour, event.endHour)}</p></header>{workspace.permissions.openPlay === "MANAGE" ? <PrepareOpenPlay publicId={publicId} /> : <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">A manager has not prepared BunalQ for this Event.</p>}</div>;
}
