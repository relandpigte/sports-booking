import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

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
<OpenPlayConsole
        snapshot={snapshot}
        canManage={workspace.permissions.openPlay === "MANAGE"}
        header={{
          publicUrl,
          qrSvg: qrSvg(publicUrl, { title: `BunalQ for ${snapshot.queue.title}`, className: "h-full w-full" }),
          subtitle: `${snapshot.queue.hub.name}${event ? ` · ${formatManilaDateLong(event.date)} · ${formatSlotRange(event.startHour, event.endHour)}` : " · Quick Queue"}`,
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
  );
}
