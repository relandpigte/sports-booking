import Link from "next/link";
import { formatPHP } from "@/lib/currency";
import { GAME_LABELS } from "@/lib/constants";
import type { Hub } from "@/lib/hubs";

export function HubCard({
  hub,
  distanceKm,
  availableSlots,
  availabilityDate,
}: {
  hub: Hub;
  distanceKm?: number;
  availableSlots?: number | null;
  availabilityDate?: string;
}) {
  const startingRate = hub.courts.reduce<number | null>(
    (lowest, court) =>
      court.hourlyRate != null &&
      (lowest == null || court.hourlyRate < lowest)
        ? court.hourlyRate
        : lowest,
    null
  );
  const mapsHref =
    hub.latitude != null && hub.longitude != null
      ? `https://www.google.com/maps/dir/?api=1&destination=${hub.latitude},${hub.longitude}`
      : hub.address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hub.address)}`
        : null;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[20px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5 transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-navy/10">
      <Link
        href={`/hubs/${hub.id}`}
        aria-label={`View ${hub.name}`}
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
          <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
            No cover photo
          </div>
        )}
        {distanceKm != null && (
          <span className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-primary shadow-md backdrop-blur-sm">
            <span aria-hidden="true">⌖</span>{" "}
            {distanceKm < 1
              ? `${Math.round(distanceKm * 1000)} m`
              : `${distanceKm.toFixed(1)} km`}
          </span>
        )}
      </div>

      <div className="relative z-[1] flex flex-1 flex-col p-5 pointer-events-none">
        <h2 className="text-lg font-black leading-tight text-navy">
          {hub.name}
        </h2>

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
          <span>
            {availableSlots != null && availabilityDate
              ? `${availableSlots} ${availableSlots === 1 ? "slot" : "slots"} available`
              : `${hub.courts.length} ${hub.courts.length === 1 ? "court" : "courts"}`}
          </span>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto relative z-10 inline-flex min-h-10 items-center rounded-xl border border-primary/15 bg-primary-soft px-3 text-primary transition-colors hover:bg-accent-soft"
            >
              Navigate ↗
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
