import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getOpenPlayWorkspace, listBunalQEligibleEvents, listOpenPlayQueues } from "@/lib/open-play";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "BunalQ — Bunal.club" };

export default async function BunalQPage() {
  const workspace = await getOpenPlayWorkspace("VIEW");
  if (!workspace) redirect("/dashboard/partner?access=denied");
  const [queues, events] = await Promise.all([
    listOpenPlayQueues(workspace.partnerId),
    listBunalQEligibleEvents(workspace.partnerId),
  ]);
  const canManage = workspace.permissions.openPlay === "MANAGE";
  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Live court rotation</p><h1 className="mt-1 text-3xl font-black text-navy">BunalQ</h1><p className="mt-2 text-sm text-slate-500">Run Event queues or launch a no-event Quick Queue.</p></div>
        {canManage ? <Link href="/dashboard/bunalq/new" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-black text-white">Start Quick Queue</Link> : null}
      </header>
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {queues.map((queue) => {
          const run = queue.sessions[0];
          return <Link key={queue.publicId} href={`/dashboard/bunalq/${queue.publicId}`} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-primary/40 hover:shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap gap-2"><span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-black text-primary">{queue.kind === "QUICK" ? "QUICK QUEUE" : "EVENT"}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">RUN {run?.runNumber ?? 1}</span></div><h2 className="mt-2 truncate font-black text-navy">{queue.title}</h2><p className="mt-1 text-xs text-slate-500">{queue.hub.name}{queue.event ? ` · ${formatManilaDateLong(queue.event.date)} · ${formatSlotRange(queue.event.startHour, queue.event.endHour)}` : " · Started without an Event"}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${run?.status === "ACTIVE" ? "bg-primary text-white" : "bg-slate-100 text-slate-600"}`}>{run?.status ?? "READY"}</span></div></Link>;
        })}
        {queues.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 sm:col-span-2">No BunalQ rooms yet.</p> : null}
      </section>
      {canManage && events.length > 0 ? <section className="mt-8"><h2 className="text-lg font-black text-navy">Events ready for BunalQ</h2><div className="mt-3 grid gap-2">{events.map((event) => <Link key={event.publicId} href={`/dashboard/events/${event.publicId}/bunalq`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"><div><p className="text-sm font-black text-navy">{event.title}</p><p className="text-xs text-slate-500">{event.hub.name} · {formatManilaDateLong(event.date)}</p></div><span className="text-xs font-black text-primary">Prepare →</span></Link>)}</div></section> : null}
    </div>
  );
}
