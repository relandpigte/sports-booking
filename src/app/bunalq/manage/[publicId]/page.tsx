import type { Metadata } from "next";
import Link from "next/link";

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
        <OpenPlayConsole
          snapshot={snapshot}
          canManage
          header={{
            publicUrl,
            qrSvg: qrSvg(publicUrl, { title: `BunalQ for ${snapshot.queue.title}`, className: "h-full w-full" }),
            subtitle: `Guest Quick Queue · ${snapshot.courts.length} ${snapshot.courts.length === 1 ? "court" : "courts"}`,
            notice: "Keep using this browser: clearing browser data permanently removes organizer access. Ended guest queues are deleted after 24 hours.",
            history: history.map((run) => ({
              id: run.id,
              runNumber: run.runNumber,
              status: run.status,
              players: run._count.participants,
              matches: run._count.games,
            })),
          }}
        />
      </div>
    </PageShell>
  );
}
