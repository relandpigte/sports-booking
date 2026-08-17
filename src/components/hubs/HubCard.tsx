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
  const mapsHref =
    hub.latitude != null && hub.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${hub.latitude},${hub.longitude}`
      : hub.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hub.address)}`
        : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg hover:shadow-navy/8">
      <Link
        href={hubPublicPath(hub)}
        aria-label={`View ${hub.name}${comingSoon ? ", coming soon" : ""}`}
        className="absolute inset-0 z-0"
      />
      <div className="relative aspect-video overflow-hidden bg-navy-soft">
        {hub.coverPhotos[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={hub.coverPhotos[0]}
            alt={`${hub.name} cover`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <HubCoverFallback hubName={hub.name} />
        )}
        {comingSoon && (
          <div className="absolute -left-12 top-6 z-10 w-48 -rotate-45 bg-navy py-1.5 text-center shadow-lg">
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">
              Coming soon
            </span>
          </div>
        )}
        {distanceKm != null && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-navy/85 px-3 py-1.5 text-xs font-bold text-white shadow-sm backdrop-blur-sm">
            <span aria-hidden="true">⌖</span>{" "}
            {distanceKm < 1
              ? `${Math.round(distanceKm * 1000)} m`
              : `${distanceKm.toFixed(1)} km`}
          </span>
        )}
      </div>

      <div className="relative z-[1] flex flex-1 flex-col p-5 pointer-events-none">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-tight text-navy">
              {hub.name}
            </h2>
            {verified && <VerifiedBadge className="mt-1.5" />}
          </div>
          {hub.logo && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#dfe7e2] bg-white p-1.5 shadow-sm">
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
          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
            <span aria-hidden="true" className="mr-1 text-ocean">
              ⌖
            </span>
            {hub.address}
          </p>
        )}

        {hub.games.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {hub.games.map((g) => (
              <span
                key={g}
                className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-primary"
              >
                {GAME_LABELS[g] ?? g}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500">
          {comingSoon ? (
            <span className="flex items-center gap-2 rounded-xl border border-navy/5 bg-navy-soft px-3 py-2">
              <ClockIcon />
              <span className="flex flex-col gap-0.5">
                <span className="font-bold text-navy">
                  Online booking coming soon
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  Venue setup in progress
                </span>
              </span>
            </span>
          ) : (
            <span
              className={`flex items-center gap-2 ${
                availableSlots != null && availabilityDate
                  ? closureReason
                    ? "rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                    : "rounded-xl border border-primary/10 bg-primary-soft px-3 py-2"
                  : ""
              }`}
            >
              {availableSlots != null && availabilityDate ? (
                <>
                  <CalendarCheckIcon
                    className={closureReason ? "text-amber-700" : "text-primary"}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={`font-bold ${closureReason ? "text-amber-800" : "text-primary"}`}
                    >
                      {closureReason
                        ? "Closed"
                        : `${availableSlots} ${availableSlots === 1 ? "slot" : "slots"} available`}
                    </span>
                    <time
                      dateTime={availabilityDate}
                      className={`text-[10px] font-semibold ${closureReason ? "text-amber-700" : "text-primary/65"}`}
                    >
                      {closureReason
                        ? `${closureReason} · ${availabilityDate === today ? "Today" : formatAvailabilityDate(availabilityDate)}`
                        : availabilityDate === today
                          ? `Today · ${formatAvailabilityDate(availabilityDate)}`
                          : formatAvailabilityDate(availabilityDate)}
                    </time>
                  </span>
                </>
              ) : (
                `${hub.courts.length} ${hub.courts.length === 1 ? "court" : "courts"}`
              )}
            </span>
          )}
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto relative z-10 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-1 text-ocean transition-colors hover:text-navy"
            >
              Navigate <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-[#dfe7e2] pt-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Starting from
            </p>
            <p className="mt-1 text-xl font-black text-primary">
              {startingRate != null ? formatPHP(startingRate) : "Rate on request"}
              {startingRate != null && (
                <span className="ml-1 text-xs font-semibold text-slate-400">
                  / hr
                </span>
              )}
            </p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-navy text-lg text-white transition-transform group-hover:translate-x-1">
            →
          </span>
        </div>
      </div>
    </article>
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
      className={`h-5 w-5 shrink-0 ${className}`}
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
      className="h-5 w-5 shrink-0 text-navy"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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
