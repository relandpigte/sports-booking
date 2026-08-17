import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  OpenPlayConsole,
  PrepareOpenPlay,
} from "@/components/open-play/OpenPlayConsole";
import {
  getOpenPlayEvent,
  getOpenPlayWorkspace,
  getOperatorOpenPlaySnapshot,
} from "@/lib/open-play";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { qrSvg } from "@/lib/qr";
import { absoluteUrl } from "@/lib/site";
import { CopyLiveLinkButton } from "@/components/open-play/CopyLiveLinkButton";

export const metadata: Metadata = {
  title: "Open Play console — Bunal.club",
};

export default async function OpenPlayConsolePage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const workspace = await getOpenPlayWorkspace("VIEW");
  if (!workspace) redirect("/dashboard/partner?access=denied");
  const { publicId } = await params;
  const event = await getOpenPlayEvent(publicId, workspace.partnerId);
  if (!event) notFound();
  const snapshot = await getOperatorOpenPlaySnapshot(publicId, workspace.partnerId);
  const canManage = workspace.permissions.openPlay === "MANAGE";

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/dashboard/events/${publicId}`}
          className="text-sm font-bold text-primary hover:underline"
        >
          ← Event details
        </Link>
        <Link
          href={`/events/${publicId}/live`}
          target="_blank"
          className="text-sm font-bold text-navy hover:underline"
        >
          View player board ↗
        </Link>
      </div>
      <header className="my-5 rounded-3xl bg-navy p-6 text-white sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-accent">
          Live Open Play
        </p>
        <h1 className="mt-2 text-3xl font-black">{event.title}</h1>
        <p className="mt-2 text-sm text-white/65">
          {event.hub.name} · {formatManilaDateLong(event.date)} · {formatSlotRange(event.startHour, event.endHour)}
        </p>
      </header>
      {snapshot ? (
        <>
          <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
            <div
              className="h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-slate-200"
              dangerouslySetInnerHTML={{
                __html: qrSvg(absoluteUrl(`/events/${publicId}/live`), {
                  title: `Live queue for ${event.title}`,
                  className: "h-full w-full",
                }),
              }}
            />
            <div className="min-w-0">
              <p className="font-black text-navy">Player live board</p>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Display this QR at the venue or share the link. Players can view the queue but cannot change it.
              </p>
              <a
                href={absoluteUrl(`/events/${publicId}/live`)}
                target="_blank"
                className="mt-2 block truncate text-sm font-bold text-primary hover:underline"
              >
                {absoluteUrl(`/events/${publicId}/live`)}
              </a>
              <CopyLiveLinkButton url={absoluteUrl(`/events/${publicId}/live`)} />
            </div>
          </section>
          <OpenPlayConsole snapshot={snapshot} canManage={canManage} />
        </>
      ) : canManage ? (
        <PrepareOpenPlay publicId={publicId} />
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          A manager has not prepared this queue yet.
        </p>
      )}
    </div>
  );
}
