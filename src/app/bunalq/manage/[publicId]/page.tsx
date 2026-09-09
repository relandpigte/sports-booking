import type { Metadata } from "next";
import Link from "next/link";

import { CopyLiveLinkButton } from "@/components/open-play/CopyLiveLinkButton";
import { OpenPlayConsole } from "@/components/open-play/OpenPlayConsole";
import { PageShell } from "@/components/PageShell";
import { getGuestBunalQWorkspace } from "@/lib/guest-bunalq";
import {
  getOperatorOpenPlaySnapshot,
  listOpenPlayRunHistory,
} from "@/lib/open-play";
import { qrSvg } from "@/lib/qr";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Guest BunalQ console — Bunal.club",
  robots: { index: false, follow: false },
};

function AccessLost({ publicId }: { publicId: string }) {
  return (
    <PageShell maxWidth="max-w-xl">
      <div className="py-12 sm:py-20">
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center sm:p-8">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">
            Organizer access unavailable
          </p>
          <h1 className="mt-3 text-2xl font-black text-navy">
            This browser is not the organizer
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Guest BunalQ access cannot be recovered after the organizer cookie
            is cleared or expires. The player board remains public until the
            queue is deleted.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href={`/q/${publicId}`}
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-black text-white"
            >
              Open player board
            </Link>
            <Link
              href="/bunalq/new"
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-navy"
            >
              Create another BunalQ
            </Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}

export default async function GuestBunalQConsolePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const workspace = await getGuestBunalQWorkspace();
  if (!workspace) return <AccessLost publicId={publicId} />;

  const [snapshot, history] = await Promise.all([
    getOperatorOpenPlaySnapshot(publicId, workspace.partnerId),
    listOpenPlayRunHistory(publicId, workspace.partnerId),
  ]);
  if (!snapshot || !snapshot.queue.guestCreated) {
    return <AccessLost publicId={publicId} />;
  }

  const publicUrl = absoluteUrl(`/q/${snapshot.queue.publicId}`);
  return (
    <PageShell maxWidth="max-w-7xl">
      <div className="py-6 sm:py-10">
        <Link href="/bunalq" className="inline-flex min-h-10 items-center text-sm font-bold text-primary">
          ← Live BunalQ
        </Link>
        <header className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-navy">BunalQ</h1>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${snapshot.status === "ACTIVE" ? "bg-primary-soft text-primary" : "bg-slate-100 text-slate-500"}`}>
                  {snapshot.status}
                </span>
              </div>
              <p className="mt-1 text-xs font-bold text-slate-400">
                Guest-created Quick Queue · Run {snapshot.runNumber}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CopyLiveLinkButton url={publicUrl} />
              <Link href={`/q/${snapshot.queue.publicId}`} target="_blank" className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-navy transition hover:bg-slate-50">
                Open player board ↗
              </Link>
            </div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-lg font-black text-navy">{snapshot.queue.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Guest-created Quick Queue · {snapshot.courts.length} {snapshot.courts.length === 1 ? "court" : "courts"}
            </p>
          </div>
        </header>
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          <details className="rounded-2xl border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-black text-navy">Share public QR code</summary>
            <div className="mt-4 grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
              <div className="h-20 w-20 overflow-hidden rounded-xl border border-slate-200" dangerouslySetInnerHTML={{ __html: qrSvg(publicUrl, { title: `BunalQ for ${snapshot.queue.title}`, className: "h-full w-full" }) }} />
              <div className="min-w-0">
                <p className="text-xs leading-5 text-slate-500">Anyone with this link can view the courts and request to join.</p>
                <a href={publicUrl} target="_blank" className="mt-1 block truncate text-xs font-bold text-primary">{publicUrl}</a>
              </div>
            </div>
          </details>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-black text-amber-900">Keep using this browser</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Clearing browser data permanently removes organizer access. Ended guest queues are deleted after 24 hours.
            </p>
            {history.length > 1 ? <p className="mt-2 text-xs font-bold text-amber-900">{history.length} runs saved in this queue</p> : null}
          </div>
        </div>
        <OpenPlayConsole snapshot={snapshot} canManage />
      </div>
    </PageShell>
  );
}
