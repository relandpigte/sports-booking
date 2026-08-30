import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { PublicEventView } from "@/lib/events";
import { formatManilaDate, formatSlotRange } from "@/lib/time";
import {
  SERVICE_FEE_PERCENT,
} from "@/lib/constants";

export function FeaturedEventCard({ event }: { event: PublicEventView }) {
  const courtNames = event.courts.map((court) => court.name).join(", ");
  return (
    <article className="group min-w-0 overflow-hidden rounded-3xl bg-navy shadow-xl shadow-navy/10">
      <Link href={`/events/${event.publicId}`} className="relative block p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(163,206,60,0.16)_1px,transparent_0)] bg-[size:24px_24px]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-ocean/25" />

        <div className="relative flex flex-col gap-6 md:flex-row md:gap-8">
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 md:justify-start">
              <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-accent backdrop-blur">
                {event.sport}
              </span>
              <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black text-white backdrop-blur md:hidden">
                {eventPriceLabel(event.registrationFee)}
              </span>
            </div>

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
              {formatManilaDate(event.date)}
              {event.series
                ? ` · Weekly ${event.series.position}/${event.series.total}`
                : ""}
            </p>
            <h2 className="mt-1 break-words text-2xl font-black leading-[1.08] tracking-[-0.035em] text-white transition-colors group-hover:text-accent sm:text-3xl lg:text-4xl">
              {event.title}
            </h2>

            <dl className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/80">
              <FeaturedFact icon={<ClockIcon />}>
                {formatSlotRange(event.startHour, event.endHour)}
              </FeaturedFact>
              <FeaturedFact icon={<PlayersIcon />}>
                {event.full
                  ? "Waitlist open"
                  : `${event.remainingSpots} ${event.remainingSpots === 1 ? "spot" : "spots"} available`}
              </FeaturedFact>
            </dl>
          </div>

          <div className="flex w-full shrink-0 flex-col justify-between md:w-[340px]">
            <div className="rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-md lg:p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">
                Venue &amp; court
              </p>
              <div className="mt-3 flex min-w-0 items-center gap-3">
                <Avatar
                  src={event.hub.logo}
                  name={event.hub.name}
                  size={42}
                  shape="rounded"
                  fit="contain"
                  className="bg-white p-1 ring-1 ring-white/20"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-white">
                    {event.hub.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/60">
                    {event.hub.address ??
                      (event.hub.verified ? "Verified venue" : "Venue partner")}
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-xl bg-white px-3.5 py-3 text-navy shadow-sm">
                <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-primary">
                  <CourtIcon />
                  Your assigned court
                </p>
                <p className="mt-1 break-words text-base font-black tracking-[-0.015em]">
                  {courtNames || "Court details coming soon"}
                </p>
              </div>
            </div>

            <div className="mt-4 hidden items-center justify-between md:flex">
              <span className="text-lg font-black text-white">
                {eventPriceLabel(event.registrationFee)}
              </span>
              <span className="flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-black text-navy transition-colors group-hover:bg-white">
                View event
              </span>
            </div>
          </div>

          <span className="flex min-h-12 w-full items-center justify-center rounded-xl bg-accent px-4 text-sm font-black text-navy transition-colors group-hover:bg-white md:hidden">
            View event
          </span>
        </div>
      </Link>
    </article>
  );
}

export function CompactEventCard({
  event,
  past = false,
}: {
  event: PublicEventView;
  past?: boolean;
}) {
  const date = dateParts(event.date);
  const courtNames = event.courts.map((court) => court.name).join(", ");
  return (
    <article
      className={`group min-w-0 rounded-2xl border bg-white transition-all ${
        past
          ? "border-slate-200 opacity-75"
          : "border-slate-200 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
      }`}
    >
      <Link
        href={`/events/${event.publicId}`}
        className="flex h-full min-w-0 flex-col p-4 sm:p-5"
      >
        <span className="flex min-w-0 items-start gap-4">
          <span className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-2xl bg-navy-soft text-center">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
              {date.month}
            </span>
            <span className="mt-0.5 text-base font-black leading-none text-navy">
              {date.day}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
                {event.sport}
              </span>
              <span className="shrink-0 text-sm font-black text-navy">
                {eventPriceLabel(event.registrationFee)}
              </span>
            </span>
            <span className="mt-2 block text-base font-black tracking-tight text-navy transition-colors group-hover:text-primary">
              {event.title}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
                <ClockIcon />
                {formatSlotRange(event.startHour, event.endHour)}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 font-semibold ${
                  past
                    ? "text-slate-500"
                    : event.full
                      ? "text-amber-700"
                      : "text-primary"
                }`}
              >
                <PlayersIcon />
                {past
                  ? "Completed"
                  : event.full
                    ? "Waitlist open"
                    : `${event.remainingSpots} available`}
              </span>
            </span>
          </span>
        </span>

        <span className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:px-4 sm:py-3.5">
          <span className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar
              src={event.hub.logo}
              name={event.hub.name}
              size={36}
              shape="rounded"
              fit="contain"
              className="bg-white p-1 shadow-sm ring-1 ring-slate-900/5"
            />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-bold text-navy">
                {event.hub.name}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                {event.hub.address ??
                  (event.hub.verified ? "Verified venue" : "Venue partner")}
              </span>
            </span>
          </span>
          <span className="border-t border-slate-200 pt-3 sm:max-w-[45%] sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 sm:text-right">
            <span className="block text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
              Your court
            </span>
            <span className="mt-0.5 flex items-start gap-1.5 text-[13px] font-black text-navy sm:justify-end">
              <span className="mt-px shrink-0 text-primary">
                <CourtIcon />
              </span>
              <span className="break-words">
                {courtNames || "Details coming soon"}
              </span>
            </span>
          </span>
        </span>
      </Link>
    </article>
  );
}

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
            {event.series ? (
              <Badge tone="neutral" className="bg-white/90">
                Weekly {event.series.position}/{event.series.total}
              </Badge>
            ) : null}
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
                {event.confirmedCount} / {event.capacity} confirmed
                {event.pendingCount > 0 && (
                  <> · {event.pendingCount} in checkout</>
                )}
              </span>
              <span className={event.full ? "font-bold text-amber-700" : "font-bold text-primary"}>
                {past ? "Completed" : event.full ? "Waitlist open" : `${event.remainingSpots} available`}
              </span>
            </div>
            {!past && event.pendingCount > 0 && (
              <p className="mt-2 text-xs text-slate-400">
                {event.pendingCount === 1
                  ? "1 spot is temporarily held while a player completes checkout."
                  : `${event.pendingCount} spots are temporarily held while players complete checkout.`}
              </p>
            )}
            {!past && (
              <p className={`${event.pendingCount > 0 ? "mt-1" : "mt-2"} text-xs text-slate-400`}>
                {event.registrationFee > 0
                  ? event.hub.paymentMode === "MANUAL"
                    ? "Manual payment · no Bunal service fee"
                    : `+ ${SERVICE_FEE_PERCENT}% non-refundable Bunal service fee at checkout`
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

function FeaturedFact({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="shrink-0 text-accent">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function eventPriceLabel(fee: number) {
  return fee === 0 ? "Free" : formatPHP(fee);
}

function dateParts(date: string) {
  const value = new Date(`${date}T12:00:00+08:00`);
  return {
    month: new Intl.DateTimeFormat("en-PH", {
      month: "short",
      timeZone: "Asia/Manila",
    }).format(value),
    day: new Intl.DateTimeFormat("en-PH", {
      day: "2-digit",
      timeZone: "Asia/Manila",
    }).format(value),
  };
}

const eventIconProps = {
  width: 17,
  height: 17,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function ClockIcon() {
  return (
    <svg {...eventIconProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function PlayersIcon() {
  return (
    <svg {...eventIconProps}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  );
}

function CourtIcon() {
  return (
    <svg {...eventIconProps} width={15} height={15}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16M3 12h18" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
