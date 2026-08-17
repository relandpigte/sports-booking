import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { listOpenPlayEvents, getOpenPlayWorkspace } from "@/lib/open-play";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export const metadata: Metadata = { title: "Open Play — Bunal.club" };

export default async function OpenPlayListPage() {
  const workspace = await getOpenPlayWorkspace("VIEW");
  if (!workspace) redirect("/dashboard/partner?access=denied");
  const events = await listOpenPlayEvents(workspace.partnerId);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h1 className="text-3xl font-black text-navy">Open Play</h1>
      <p className="mt-2 text-sm text-slate-500">
        Prepare and run live court rotations from published pickleball Events.
      </p>
      <div className="mt-6 grid gap-3">
        {events.map((event) => (
          <Link
            key={event.publicId}
            href={`/dashboard/events/${event.publicId}/open-play`}
            className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-primary/40 hover:shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-black text-navy">{event.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {event.hub.name} · {formatManilaDateLong(event.date)} · {formatSlotRange(event.startHour, event.endHour)}
                </p>
              </div>
              <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-black text-primary">
                {event.openPlaySession?.status ?? (event.status === "CANCELLED" ? "CANCELLED" : "NOT PREPARED")}
              </span>
            </div>
          </Link>
        ))}
        {events.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
            No published pickleball Events are available.
          </p>
        ) : null}
      </div>
    </div>
  );
}
