import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { PublicEventView } from "@/lib/events";
import { formatManilaDate, formatSlotRange } from "@/lib/time";

export function EventCard({
  event,
  past = false,
}: {
  event: PublicEventView;
  past?: boolean;
}) {
  const courtNames = event.courts.map((court) => court.name).join(", ");
  return (
    <article
      className={`group overflow-hidden rounded-3xl border bg-white transition-all ${
        past
          ? "border-slate-200 opacity-75"
          : "border-slate-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5"
      }`}
    >
      <Link href={`/events/${event.publicId}`} className="block">
        <div className="relative h-36 overflow-hidden bg-navy sm:h-40">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(163,206,60,0.18)_1px,transparent_0)] bg-[size:22px_22px]" />
          <div className="absolute inset-0 bg-gradient-to-br from-primary/35 via-transparent to-ocean/30" />
          <div className="absolute left-5 top-5 flex items-center gap-2">
            <Badge tone={past ? "neutral" : "primary"} className="bg-white/90 uppercase tracking-[0.12em]">
              Open play
            </Badge>
            {event.full && !past && <Badge tone="warn">Waitlist open</Badge>}
          </div>
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                src={event.hub.logo}
                name={event.hub.name}
                size={42}
                shape="rounded"
                className="bg-white ring-2 ring-white/20"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{event.hub.name}</p>
                <p className="text-xs text-white/65">
                  {event.hub.verified ? "Verified venue" : "Venue partner"}
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-bold backdrop-blur">
              {formatPHP(event.registrationFee)}
            </span>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <h2 className="text-xl font-black tracking-[-0.025em] text-navy transition-colors group-hover:text-primary">
            {event.title}
          </h2>
          {event.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
              {event.description}
            </p>
          )}

          <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <EventFact label="Date & time">
              {formatManilaDate(event.date)} · {formatSlotRange(event.startHour, event.endHour)}
            </EventFact>
            <EventFact label="Sport & courts">
              {event.sport} · {courtNames}
            </EventFact>
          </dl>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="font-semibold text-navy">
                {event.confirmedCount} / {event.capacity} players confirmed
              </span>
              <span className={event.full ? "font-bold text-amber-700" : "font-bold text-primary"}>
                {past ? "Completed" : event.full ? "Full" : `${event.remainingSpots} left`}
              </span>
            </div>
            {!past && (
              <p className="mt-2 text-xs text-slate-400">
                {event.registrationFee > 0
                  ? "+ 3% Bunal service fee at checkout"
                  : "Free registration · no checkout required"}
              </p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

function EventFact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-slate-700">{children}</dd>
    </div>
  );
}
