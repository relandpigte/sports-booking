import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { BookCourtPanel } from "@/components/hubs/BookCourtPanel";
import { Avatar } from "@/components/ui/Avatar";
import { getPublicHub } from "@/lib/hubs";
import { getViewer } from "@/lib/dal";
import { getCourtAvailability } from "@/lib/bookings";
import { formatTime, summarizeOperatingHours } from "@/lib/hours";
import { formatPHP } from "@/lib/currency";
import { manilaNowHour, manilaToday } from "@/lib/time";
import {
  WEEKDAYS,
  GAME_LABELS,
  COURT_TYPE_LABELS,
  type Weekday,
} from "@/lib/constants";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hub = await getPublicHub(id);
  return {
    title: hub ? `${hub.name} — Bunal.ph` : "Hub — Bunal.ph",
    description: hub?.about ?? undefined,
  };
}

export default async function PublicHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hub = await getPublicHub(id);

  if (!hub) {
    notFound();
  }

  const [cover, ...moreCovers] = hub.coverPhotos;
  const hours = hub.operatingHours;

  // This page is public, so getViewer (which returns null when signed out)
  // rather than getCurrentUser (which would redirect anonymous visitors).
  const today = manilaToday();
  const firstCourt = hub.courts[0];
  const [viewer, initialAvailability] = await Promise.all([
    getViewer(),
    // Render the first court's grid populated, so there's no empty flash before
    // the availability stream connects.
    firstCourt ? getCourtAvailability(firstCourt.id, today) : null,
  ]);

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasCoords = hub.latitude != null && hub.longitude != null;
  const mapsQuery = hasCoords
    ? `${hub.latitude},${hub.longitude}`
    : (hub.address ?? "");

  return (
    <PageShell maxWidth="max-w-3xl">
        {/* Cover */}
        <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-gray-100">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={`${hub.name} cover`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
              No cover photo
            </div>
          )}
        </div>

        {moreCovers.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            {moreCovers.map((src, i) => (
              <div
                key={i}
                className="aspect-video overflow-hidden rounded-lg bg-gray-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`${hub.name} photo ${i + 2}`}
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Header: logo + name */}
        <div className="mt-6 flex items-center gap-4">
          <Avatar src={hub.logo} name={hub.name} size={64} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{hub.name}</h1>
            {hub.games.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {hub.games.map((g) => (
                  <span
                    key={g}
                    className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary"
                  >
                    {GAME_LABELS[g] ?? g}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Bunal.ph hub</p>
            )}
          </div>
        </div>

        {/* About */}
        {hub.about && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-gray-900">About</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-600">
              {hub.about}
            </p>
          </section>
        )}

        {(hub.address || hasCoords) && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-gray-900">Location</h2>
            {hub.address && (
              <p className="mt-2 text-sm text-gray-600">{hub.address}</p>
            )}
            {mapsKey && hasCoords && (
              <iframe
                title={`Map of ${hub.name}`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="mt-3 h-64 w-full rounded-xl border border-gray-200"
                src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${hub.latitude},${hub.longitude}&zoom=16`}
              />
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                mapsQuery
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Open in Google Maps
            </a>
          </section>
        )}

        <div className="mt-8 grid grid-cols-1 gap-8 sm:grid-cols-2">
          {/* Contact */}
          <section>
            <h2 className="text-base font-semibold text-gray-900">Contact</h2>
            <dl className="mt-2 flex flex-col gap-2 text-sm">
              {hub.phone && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Phone</span>
                  <a
                    href={`tel:${hub.phone}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {hub.phone}
                  </a>
                </div>
              )}
              {hub.email && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Email</span>
                  <a
                    href={`mailto:${hub.email}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {hub.email}
                  </a>
                </div>
              )}
              {!hub.phone && !hub.email && (
                <p className="text-gray-400">No contact info provided.</p>
              )}
            </dl>
          </section>

          {/* Operating hours */}
          <section>
            <h2 className="text-base font-semibold text-gray-900">
              Operating Hours
            </h2>
            {hours ? (
              <dl className="mt-2 flex flex-col gap-1.5 text-sm">
                {WEEKDAYS.map(({ value, label }) => {
                  const day = hours[value as Weekday];
                  return (
                    <div
                      key={value}
                      className="flex items-center justify-between"
                    >
                      <dt className="text-gray-500">{label}</dt>
                      <dd className="font-medium text-gray-900">
                        {!day || day.closed
                          ? "Closed"
                          : `${formatTime(day.open)} – ${formatTime(day.close)}`}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-gray-400">Hours not set.</p>
            )}
          </section>
        </div>

        {/* The hub still renders when the venue's subscription has lapsed —
            nothing is deleted, it just stops taking new bookings. */}
        {hub.bookable ? (
          <BookCourtPanel
            courts={hub.courts}
            operatingHours={hours}
            today={today}
            nowHour={manilaNowHour()}
            initialAvailability={
              initialAvailability
                ? {
                    courtId: initialAvailability.courtId,
                    date: initialAvailability.date,
                    bookedHours: initialAvailability.bookedHours,
                  }
                : null
            }
            viewerRole={viewer?.role ?? null}
            paymentRequired={hub.paymentRequired}
          />
        ) : (
          <section className="mt-8 rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center">
            <p className="text-sm text-gray-500">
              This venue isn&apos;t taking online bookings right now. Contact
              them directly using the details above.
            </p>
          </section>
        )}

        {/* Courts */}
        {hub.courts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-base font-semibold text-gray-900">
              Courts ({hub.courts.length})
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {hub.courts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-gray-200 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      {COURT_TYPE_LABELS[c.courtType] ?? c.courtType}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-primary">
                    {c.hourlyRate != null
                      ? `${formatPHP(c.hourlyRate)}/hr`
                      : "Rate on request"}
                  </p>
                  {hours && (
                    <dl className="mt-3 flex flex-col gap-0.5 text-xs text-gray-500">
                      {summarizeOperatingHours(hours).map((seg, idx) => (
                        <div key={idx} className="flex justify-between gap-3">
                          <dt>{seg.label}</dt>
                          <dd className="text-gray-700">{seg.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
    </PageShell>
  );
}
