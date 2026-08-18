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
      <Link href="/dashboard/bunalq" className="inline-flex min-h-10 items-center text-sm font-bold text-primary">← All BunalQ sessions</Link>
      <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-navy">BunalQ</h1>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${snapshot.status === "ACTIVE" ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-500"}`}>{snapshot.status}</span>
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400">Live court rotation · Run {snapshot.runNumber}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyLiveLinkButton url={publicUrl} />
            <Link href={`/q/${snapshot.queue.publicId}`} target="_blank" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-navy transition hover:bg-slate-50">Open player board ↗</Link>
          </div>
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-lg font-black text-navy">{snapshot.queue.title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{snapshot.queue.hub.name}{event ? ` · ${formatManilaDateLong(event.date)} · ${formatSlotRange(event.startHour, event.endHour)}` : " · Quick Queue"}</p>
        </div>
      </header>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <details className="rounded-2xl border border-slate-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-black text-navy">Share public QR code</summary>
          <div className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
            <div className="h-20 w-20 overflow-hidden rounded-xl border border-slate-200" dangerouslySetInnerHTML={{ __html: qrSvg(publicUrl, { title: `BunalQ for ${snapshot.queue.title}`, className: "h-full w-full" }) }} />
            <div className="min-w-0">
              <p className="text-xs leading-5 text-slate-500">Players can view courts and queue order{snapshot.queue.kind === "QUICK" ? " and request to join" : ""}.</p>
              <a href={publicUrl} target="_blank" className="mt-1 block truncate text-xs font-bold text-primary">{publicUrl}</a>
            </div>
          </div>
        </details>
        {history.length > 1 ? (
          <details className="rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-black text-navy">Run history · {history.length} runs</summary>
            <div className="mt-3 grid gap-2">
              {history.map((run) => (
                <div key={run.id} className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center justify-between"><p className="text-sm font-black text-navy">Run {run.runNumber}</p><span className="text-[10px] font-black text-slate-500">{run.status}</span></div>
                  <p className="mt-1 text-xs text-slate-500">{run._count.participants} players · {run._count.games} matches</p>
                </div>
              ))}
            </div>
          </details>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-navy">Run history</p>
            <p className="mt-1 text-xs text-slate-500">This is the first run for this queue.</p>
          </div>
        )}
      </div>
      <OpenPlayConsole snapshot={snapshot} canManage={workspace.permissions.openPlay === "MANAGE"} />
    </div>
  );
}
