import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { formatPHP } from "@/lib/currency";
import type { PublicEventView } from "@/lib/events";
import { formatManilaDate, formatSlotRange } from "@/lib/time";
import {
  MANUAL_SERVICE_FEE_PERCENT,
  SERVICE_FEE_PERCENT,
} from "@/lib/constants";

export function FeaturedEventCard({ event }: { event: PublicEventView }) {
  const courtNames = event.courts.map((court) => court.name).join(", ");
  return (
    <article className="group min-w-0 overflow-hidden rounded-3xl bg-navy shadow-xl shadow-navy/10">
      <Link href={`/events/${event.publicId}`} className="relative block p-5 sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(163,206,60,0.16)_1px,transparent_0)] bg-[size:24px_24px]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-ocean/25" />

        <div className="relative">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent">
                {formatManilaDate(event.date)}
              </p>
              <h2 className="mt-2 break-words text-2xl font-black leading-[1.08] tracking-[-0.035em] text-white transition-colors group-hover:text-accent sm:text-3xl">
                {event.title}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-black text-white backdrop-blur">
              {eventPriceLabel(event.registrationFee)}
            </span>
          </div>

          <dl className="mt-6 grid gap-3 text-sm text-white/65 sm:grid-cols-2">
            <FeaturedFact icon={<ClockIcon />}>
              {formatSlotRange(event.startHour, event.endHour)}
            </FeaturedFact>
            <FeaturedFact icon={<MapPinIcon />}>{event.hub.name}</FeaturedFact>
            <FeaturedFact icon={<TrophyIcon />}>
              {event.sport} · {courtNames}
            </FeaturedFact>
            <FeaturedFact icon={<PlayersIcon />}>
              {event.full
                ? "Waitlist open"
                : `${event.remainingSpots} ${event.remainingSpots === 1 ? "spot" : "spots"} available`}
            </FeaturedFact>
          </dl>

          <span className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-accent px-4 text-sm font-black text-navy transition-colors group-hover:bg-white">
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
  return (
    <article
      className={`min-w-0 rounded-2xl border bg-white ${
        past ? "border-slate-200 opacity-75" : "border-slate-200"
      }`}
    >
      <Link
        href={`/events/${event.publicId}`}
        className="flex min-w-0 items-center gap-3 p-3.5 transition-colors hover:bg-slate-50 sm:gap-4 sm:p-4"
      >
        <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-navy-soft text-center">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            {date.month}
          </span>
          <span className="text-sm font-black text-navy">{date.day}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-black text-navy">
            {event.title}
          </span>
          <span className="mt-1 block truncate text-xs text-slate-500">
            {formatSlotRange(event.startHour, event.endHour)} · {event.hub.name}
          </span>
          <span className="mt-1 block truncate text-[10px] font-semibold uppercase tracking-wider text-primary">
            {event.sport} · {past ? "Completed" : event.full ? "Waitlist open" : `${event.remainingSpots} available`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="text-xs font-black text-navy">
            {eventPriceLabel(event.registrationFee)}
          </span>
          <span className="text-lg text-slate-300" aria-hidden="true">
            ›
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
                  ? `+ ${event.hub.paymentMode === "MANUAL" ? MANUAL_SERVICE_FEE_PERCENT : SERVICE_FEE_PERCENT}% non-refundable Bunal service fee at checkout`
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

function MapPinIcon() {
  return (
    <svg {...eventIconProps}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg {...eventIconProps}>
      <path d="M6 4h12v3a6 6 0 0 1-12 0Z" />
      <path d="M9 18h6M10 14v4M14 14v4M8 21h8" />
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
