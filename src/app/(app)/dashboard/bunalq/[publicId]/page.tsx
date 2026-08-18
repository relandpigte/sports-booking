import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CopyLiveLinkButton } from "@/components/open-play/CopyLiveLinkButton";
import { OpenPlayConsole } from "@/components/open-play/OpenPlayConsole";
import { getOpenPlayWorkspace, getOperatorOpenPlaySnapshot, listOpenPlayRunHistory } from "@/lib/open-play";
import { qrSvg } from "@/lib/qr";
import { absoluteUrl } from "@/lib/site";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "BunalQ console — Bunal.club" };

export default async function BunalQConsolePage({ params }: { params: Promise<{ publicId: string }> }) {
  const workspace = await getOpenPlayWorkspace("VIEW");
  if (!workspace) redirect("/dashboard/partner?access=denied");
  const { publicId } = await params;
  const [snapshot, history] = await Promise.all([
    getOperatorOpenPlaySnapshot(publicId, workspace.partnerId),
    listOpenPlayRunHistory(publicId, workspace.partnerId),
  ]);
  if (!snapshot) notFound();
  const publicUrl = absoluteUrl(`/q/${snapshot.queue.publicId}`);
  const event = snapshot.queue.event;
  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/dashboard/bunalq" className="text-sm font-bold text-primary">← BunalQ</Link><Link href={`/q/${snapshot.queue.publicId}`} target="_blank" className="text-sm font-bold text-navy">Open player board ↗</Link></div>
      <header className="my-5 rounded-3xl bg-navy p-5 text-white sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-black uppercase tracking-[0.18em] text-accent">BunalQ · Live court rotation</p><span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black">RUN {snapshot.runNumber}</span></div><h1 className="mt-2 text-2xl font-black sm:text-3xl">{snapshot.queue.title}</h1><p className="mt-2 text-sm text-white/65">{snapshot.queue.hub.name}{event ? ` · ${formatManilaDateLong(event.date)} · ${formatSlotRange(event.startHour, event.endHour)}` : " · Quick Queue"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${snapshot.status === "ACTIVE" ? "bg-primary text-white" : "bg-white/10 text-white"}`}>{snapshot.status}</span></div>
      </header>
      <section className="mb-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[96px_1fr_auto] sm:items-center">
        <div className="h-24 w-24 overflow-hidden rounded-xl border border-slate-200" dangerouslySetInnerHTML={{ __html: qrSvg(publicUrl, { title: `BunalQ for ${snapshot.queue.title}`, className: "h-full w-full" }) }} />
        <div className="min-w-0"><p className="font-black text-navy">Public player board</p><p className="mt-1 text-sm text-slate-500">Share this QR for live courts and queue order{snapshot.queue.kind === "QUICK" ? ", plus no-account guest entry" : ""}.</p><a href={publicUrl} target="_blank" className="mt-1 block truncate text-xs font-bold text-primary">{publicUrl}</a></div>
        <CopyLiveLinkButton url={publicUrl} />
      </section>
      {history.length > 1 ? <details className="mb-5 rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-black text-navy">Run history · {history.length} runs</summary><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{history.map((run) => <div key={run.id} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between"><p className="text-sm font-black text-navy">Run {run.runNumber}</p><span className="text-[10px] font-black text-slate-500">{run.status}</span></div><p className="mt-1 text-xs text-slate-500">{run._count.participants} players · {run._count.games} matches</p></div>)}</div></details> : null}
      <OpenPlayConsole snapshot={snapshot} canManage={workspace.permissions.openPlay === "MANAGE"} />
    </div>
  );
}
