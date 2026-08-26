import Link from "next/link";
import { HubCoverFallback } from "@/components/hubs/HubCoverFallback";
import { formatPHP } from "@/lib/currency";
import { GAME_LABELS, WEEKDAYS } from "@/lib/constants";
import type { Hub } from "@/lib/hubs";
import { hubPublicPath } from "@/lib/hub-slug";
import { dayWindow, weekdayIndexForDate } from "@/lib/slots";

export function HubCard({
  hub,
  distanceKm,
  availableSlots,
  availabilityDate,
  today,
  comingSoon = false,
  verified = false,
}: {
  hub: Hub;
  distanceKm?: number;
  availableSlots?: number | null;
  availabilityDate?: string;
  today?: string;
  comingSoon?: boolean;
  verified?: boolean;
}) {
  const rates = hub.courts.flatMap((court) => [
    ...(court.hourlyRate != null ? [court.hourlyRate] : []),
    ...court.scheduleRules.flatMap((rule) =>
      !rule.closed && rule.hourlyRate != null ? [rule.hourlyRate] : []
    ),
  ]);
  const startingRate = rates.length ? Math.min(...rates) : null;
  const closureReason =
    availableSlots === 0 && availabilityDate
      ? fullDayClosureReason(hub, availabilityDate)
      : null;
  const courtTypeSummary = formatCourtTypeSummary(hub);
  const mapsHref =
    hub.latitude != null && hub.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${hub.latitude},${hub.longitude}`
      : hub.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hub.address)}`
        : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[22px] border border-[#dfe7e2] bg-white shadow-[0_8px_28px_rgba(16,36,58,0.07)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-navy/10">
      <Link
        href={hubPublicPath(hub)}
        aria-label={`View ${hub.name}${comingSoon ? ", coming soon" : ""}`}
        className="absolute inset-0 z-0"
      />
      <div className="relative aspect-video overflow-hidden bg-navy-soft">
        {hub.coverPhotos[0] ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={hub.coverPhotos[0]}
              alt={`${hub.name} cover`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
            />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-navy/60 to-transparent"
            />
          </>
        ) : (
          <HubCoverFallback
            hubName={hub.name}
            sport={hub.games[0]}
            showPhotoLabel={!comingSoon}
          />
        )}
        {comingSoon && (
          <div className="absolute -left-12 top-6 z-10 w-48 -rotate-45 bg-navy py-1.5 text-center shadow-lg">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">
              Coming soon
            </span>
          </div>
        )}
        {distanceKm != null && (
          <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-navy/85 px-3 py-1.5 text-xs font-bold text-white shadow-sm backdrop-blur-sm">
            <LocationIcon />
            {distanceKm < 1
              ? `${Math.round(distanceKm * 1000)} m`
              : `${distanceKm.toFixed(1)} km`}
          </span>
        )}
      </div>

      <div className="pointer-events-none relative z-[1] flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[19px] font-black leading-tight tracking-[-0.02em] text-navy">
              {hub.name}
            </h2>
            {verified && <VerifiedBadge className="mt-2" />}
          </div>
          {hub.logo && (
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#dfe7e2] bg-white p-1 shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hub.logo}
                alt=""
                className="h-full w-full object-contain"
              />
            </span>
          )}
        </div>

        {hub.address && (
          <p className="mt-2 flex items-start gap-1.5 truncate text-sm leading-5 text-slate-500">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-ocean">
              <LocationIcon />
            </span>
            <span className="truncate">{hub.address}</span>
          </p>
        )}

        {hub.games.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {hub.games.map((g) => (
              <span
                key={g}
                className="rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] text-primary"
              >
                {GAME_LABELS[g] ?? g}
              </span>
            ))}
          </div>
        )}

        <AvailabilityStatus
          availableSlots={availableSlots}
          availabilityDate={availabilityDate}
          today={today}
          closureReason={closureReason}
          comingSoon={comingSoon}
        />

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[#dfe7e2] bg-[#f7faf8] px-3 py-2.5 text-xs font-bold text-navy">
          <span>
            {hub.courts.length} {hub.courts.length === 1 ? "court" : "courts"}
          </span>
          {courtTypeSummary && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                •
              </span>
              <span>{courtTypeSummary}</span>
            </>
          )}
        </div>

        <div className="mt-4 flex flex-col items-stretch justify-between gap-3 border-t border-[#dfe7e2] pt-3.5 sm:flex-row sm:items-center md:flex-col md:items-stretch xl:flex-row xl:items-center">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              From
            </p>
            <p className="mt-0.5 text-xl font-black text-primary">
              {startingRate != null ? formatPHP(startingRate) : "Rate on request"}
              {startingRate != null && (
                <span className="ml-1 text-xs font-semibold text-slate-400">
                  / hr
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${hub.name} in Google Maps`}
                title="Open in Google Maps"
                className="pointer-events-auto relative z-10 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[#dfe7e2] bg-white shadow-sm transition-colors hover:bg-slate-50"
              >
                <GoogleMapsIcon />
              </a>
            )}
            <span
              aria-hidden="true"
              className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-colors sm:flex-none md:flex-1 xl:flex-none ${
                comingSoon
                  ? "border border-navy text-navy group-hover:bg-navy-soft"
                  : "bg-navy text-white group-hover:bg-navy-hover"
              }`}
            >
              {comingSoon ? "View profile" : "View courts"}
              <span className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function formatCourtTypeSummary(hub: Hub): string | null {
  if (hub.courts.length === 0) return null;

  const indoorCourts = hub.courts.filter(
    (court) => court.courtType === "covered"
  ).length;
  const outdoorCourts = hub.courts.filter(
    (court) => court.courtType === "open"
  ).length;
  const otherCourts = hub.courts.length - indoorCourts - outdoorCourts;

  if (indoorCourts === hub.courts.length) return "Indoor";
  if (outdoorCourts === hub.courts.length) return "Outdoor";
  if (otherCourts === hub.courts.length) return "Court type not listed";

  return [
    indoorCourts > 0 ? `${indoorCourts} indoor` : null,
    outdoorCourts > 0 ? `${outdoorCourts} outdoor` : null,
    otherCourts > 0 ? `${otherCourts} other` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function AvailabilityStatus({
  availableSlots,
  availabilityDate,
  today,
  closureReason,
  comingSoon,
}: {
  availableSlots?: number | null;
  availabilityDate?: string;
  today?: string;
  closureReason: string | null;
  comingSoon: boolean;
}) {
  if (comingSoon) {
    return (
      <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-xl bg-navy-soft px-3 py-2 text-xs font-bold text-navy">
        <span className="flex min-w-0 items-center gap-2">
          <ClockIcon />
          <span className="truncate md:hidden xl:inline">
            Online booking coming soon
          </span>
          <span className="hidden md:inline xl:hidden">Booking soon</span>
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 md:hidden xl:inline">
          Setup in progress
        </span>
      </div>
    );
  }

  if (availableSlots == null || !availabilityDate) return null;

  const dateLabel =
    availabilityDate === today
      ? "Today"
      : formatAvailabilityDate(availabilityDate);

  if (closureReason) {
    return (
      <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
        <span
          className="flex min-w-0 items-center gap-2"
          title={`Closed · ${closureReason}`}
        >
          <CalendarCheckIcon className="text-amber-700" />
          <span className="truncate md:hidden xl:inline">
            Closed · {closureReason}
          </span>
          <span className="hidden md:inline xl:hidden">Closed</span>
        </span>
        <time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700">
          {dateLabel}
        </time>
      </div>
    );
  }

  if (availableSlots === 0) {
    return (
      <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
        <span className="flex min-w-0 items-center gap-2">
          <CalendarCheckIcon className="text-slate-500" />
          <span className="truncate md:hidden xl:inline">
            No slots available
          </span>
          <span className="hidden md:inline xl:hidden">No slots</span>
        </span>
        <time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {dateLabel}
        </time>
      </div>
    );
  }

  return (
    <div className="mt-3 flex min-h-10 items-center justify-between gap-3 rounded-xl bg-primary-soft px-3 py-2 text-xs font-bold text-primary">
      <span className="flex min-w-0 items-center gap-2">
        <CalendarCheckIcon className="text-primary" />
        <span className="truncate md:hidden xl:inline">
          {availableSlots} {availableSlots === 1 ? "slot" : "slots"} available
        </span>
        <span className="hidden md:inline xl:hidden">
          {availableSlots} available
        </span>
      </span>
      <time className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary/75">
        {dateLabel}
      </time>
    </div>
  );
}

function fullDayClosureReason(hub: Hub, date: string): string | null {
  const weekday = weekdayIndexForDate(date);
  const dayKey = WEEKDAYS[weekday]?.value;
  const window =
    dayKey && hub.operatingHours
      ? dayWindow(hub.operatingHours[dayKey])
      : null;
  if (!window || hub.courts.length === 0) return null;

  const reasons = new Set<string>();
  for (const court of hub.courts) {
    for (let hour = window.start; hour < window.end; hour++) {
      const rule = court.scheduleRules.find(
        (candidate) =>
          candidate.weekday === weekday && candidate.hour === hour
      );
      if (!rule?.closed) return null;
      if (rule.closureReason?.trim()) reasons.add(rule.closureReason.trim());
    }
  }

  if (reasons.size === 0) return null;
  const [first] = reasons;
  return reasons.size === 1 ? first : `${first} +${reasons.size - 1} more`;
}

function formatAvailabilityDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const monthName = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month - 1];

  if (!monthName || !year || !day) return date;
  return `${monthName} ${day}, ${year}`;
}

function CalendarCheckIcon({ className }: { className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={`h-4 w-4 shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d="M8 2v4M16 2v4M3 10h18" />
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="m8 15 2.2 2.2L16 12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4 shrink-0 text-navy"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function GoogleMapsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#34A853"
        d="M12 1a8 8 0 0 0-8 8c0 5.55 6.68 12.16 7.44 12.9a.8.8 0 0 0 1.12 0C13.32 21.16 20 14.55 20 9a8 8 0 0 0-8-8Z"
      />
      <path
        fill="#4285F4"
        d="M4.94 5.2A8 8 0 0 1 12 1v5.1A3 3 0 0 0 9.4 7.6L4.7 5.9l.24-.7Z"
      />
      <path
        fill="#FBBC04"
        d="M4 9c0-1.08.21-2.1.6-3.04L9.4 7.6A3 3 0 0 0 9 9c0 .75.28 1.44.74 1.97l-4.1 2.47A10.36 10.36 0 0 1 4 9Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.1V1a8 8 0 0 1 6.57 3.43l-4.2 2.9A3 3 0 0 0 12 6.1Z"
      />
      <path
        fill="#1A73E8"
        d="M14.37 7.33 18.57 4.43A7.96 7.96 0 0 1 20 9c0 1.32-.38 2.7-.98 4.04l-4.54-2.27A3 3 0 0 0 15 9c0-.62-.2-1.2-.63-1.67Z"
      />
      <circle cx="12" cy="9" r="2.05" fill="#fff" />
    </svg>
  );
}

export function VerifiedBadge({
  className = "",
  size = "compact",
}: {
  className?: string;
  size?: "compact" | "regular";
}) {
  const sizing =
    size === "regular"
      ? "h-8 gap-1.5 px-3 text-[11px]"
      : "gap-1 px-2 py-0.5 text-[10px]";

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full bg-primary-soft font-bold uppercase tracking-[0.08em] text-primary ${sizing} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-3.5 w-3.5"
        aria-hidden="true"
      >
        <path d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
      Verified
    </span>
  );
}
