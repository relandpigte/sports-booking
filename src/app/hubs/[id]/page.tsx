import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PageShell } from "@/components/PageShell";
import { BookCourtPanel } from "@/components/hubs/BookCourtPanel";
import { Avatar } from "@/components/ui/Avatar";
import { getPublicHub } from "@/lib/hubs";
import { getViewer } from "@/lib/dal";
import { getCourtAvailability } from "@/lib/bookings";
import { formatTime, summarizeOperatingHours } from "@/lib/hours";
import { formatPHP } from "@/lib/currency";
import { hubPublicPath } from "@/lib/hub-slug";
import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  conciseDescription,
  isPublicHttpUrl,
} from "@/lib/site";
import { manilaNowHour, manilaToday } from "@/lib/time";
import {
  WEEKDAYS,
  GAME_LABELS,
  COURT_TYPE_LABELS,
  type Weekday,
} from "@/lib/constants";

function hubDescription({
  name,
  about,
  address,
  games,
}: {
  name: string;
  about: string | null;
  address: string | null;
  games: string[];
}): string {
  const sports = games.map((game) => GAME_LABELS[game] ?? game).join(", ");
  const location = address ? ` in ${address}` : "";
  const introduction = about?.trim()
    ? about
    : `Book ${sports || "sports"} courts at ${name}${location}.`;

  return conciseDescription(
    `${introduction} Check live availability, hourly rates, and secure online booking.`,
    165
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const hub = await getPublicHub(id);
  if (!hub) {
    return {
      title: "Hub not found | Bunal.club",
      robots: { index: false, follow: false },
    };
  }

  const title = `${hub.name} — Court Booking & Availability | Bunal.club`;
  const description = hubDescription(hub);
  const canonical = hubPublicPath(hub);
  const socialImage =
    hub.coverPhotos.find(isPublicHttpUrl) ?? DEFAULT_SOCIAL_IMAGE;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: hub.bookable, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: SITE_NAME,
      images: [socialImage],
      locale: "en_PH",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [socialImage],
    },
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

  // The partner previewing their own hub, or an admin looking at it.
  const isOwner = viewer?.id === hub.ownerId || viewer?.role === "ADMIN";

  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const hasCoords = hub.latitude != null && hub.longitude != null;
  const mapsQuery = hasCoords
    ? `${hub.latitude},${hub.longitude}`
    : (hub.address ?? "");
  const canonicalUrl = absoluteUrl(hubPublicPath(hub));
  const description = hubDescription(hub);
  const publicImages = hub.coverPhotos.filter(isPublicHttpUrl);
  const hourlyRates = hub.courts
    .map((court) => court.hourlyRate)
    .filter((rate): rate is number => rate != null);
  const minRate = hourlyRates.length ? Math.min(...hourlyRates) : null;
  const maxRate = hourlyRates.length ? Math.max(...hourlyRates) : null;
  const openingHoursSpecification = hours
    ? WEEKDAYS.flatMap(({ value, label }) => {
        const day = hours[value as Weekday];
        if (!day || day.closed) return [];
        return [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: `https://schema.org/${label}`,
            opens: day.open,
            closes: day.close,
          },
        ];
      })
    : [];
  const localBusiness =
    hub.bookable && hub.address
      ? {
          "@type": "SportsActivityLocation",
          "@id": `${canonicalUrl}#venue`,
          name: hub.name,
          url: canonicalUrl,
          description,
          address: {
            "@type": "PostalAddress",
            streetAddress: hub.address,
            addressCountry: "PH",
          },
          ...(publicImages.length > 0 ? { image: publicImages } : {}),
          ...(hub.phone ? { telephone: hub.phone } : {}),
          ...(hub.email ? { email: hub.email } : {}),
          ...(hasCoords
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: hub.latitude,
                  longitude: hub.longitude,
                },
              }
            : {}),
          ...(mapsQuery
            ? {
                hasMap: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  mapsQuery
                )}`,
              }
            : {}),
          ...(openingHoursSpecification.length > 0
            ? { openingHoursSpecification }
            : {}),
          ...(minRate != null && maxRate != null
            ? {
                priceRange:
                  minRate === maxRate
                    ? `PHP ${minRate} per hour`
                    : `PHP ${minRate}-${maxRate} per hour`,
              }
            : {}),
          currenciesAccepted: "PHP",
        }
      : null;
  const hubJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        "@id": `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: SITE_URL,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Hubs",
            item: absoluteUrl("/hubs"),
          },
          {
            "@type": "ListItem",
            position: 3,
            name: hub.name,
            item: canonicalUrl,
          },
        ],
      },
      ...(localBusiness ? [localBusiness] : []),
    ],
  };
  const galleryCovers = moreCovers.slice(0, 2);
  const hiddenPhotoCount = Math.max(moreCovers.length - galleryCovers.length, 0);

  return (
    <PageShell
      maxWidth="max-w-none"
      backgroundClass="bg-[#f7faf8]"
      padded={false}
    >
      <JsonLd data={hubJsonLd} />

      <div className="mt-2 grid h-[300px] w-full grid-cols-1 gap-2 px-2 md:h-[480px] md:grid-cols-4">
        <div
          className={`overflow-hidden rounded-2xl bg-gray-100 ${galleryCovers.length > 0 ? "md:col-span-3" : "md:col-span-4"}`}
        >
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

        {galleryCovers.length > 0 && (
          <div
            className={`hidden gap-2 md:grid ${galleryCovers.length > 1 ? "grid-rows-2" : "grid-rows-1"}`}
          >
            {galleryCovers.map((src, index) => {
              const showCount =
                index === galleryCovers.length - 1 && hiddenPhotoCount > 0;

              return (
                <div
                  key={src}
                  className="relative overflow-hidden rounded-2xl bg-gray-100"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${hub.name} photo ${index + 2}`}
                    className="h-full w-full object-cover"
                  />
                  {showCount && (
                    <div className="absolute inset-0 flex items-center justify-center bg-navy/45">
                      <span className="rounded-full bg-white/90 px-3 py-1.5 text-sm font-semibold text-navy">
                        +{hiddenPhotoCount} more
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative z-10 mx-auto -mt-10 w-full max-w-6xl px-4 sm:px-6 md:-mt-16">
        <div className="flex flex-col items-start gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7 md:flex-row md:items-center md:gap-6">
          <Avatar
            src={hub.logo}
            name={hub.name}
            size={96}
            shape="rounded"
            className="h-20! w-20! border border-gray-200 bg-white ring-4 ring-white md:h-24! md:w-24!"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <h1 className="text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
                {hub.name}
              </h1>
              {hub.games.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {hub.games.map((game) => (
                    <span
                      key={game}
                      className="rounded-full bg-primary-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary"
                    >
                      {GAME_LABELS[game] ?? game}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {hub.address ? (
              <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-gray-500 sm:text-base">
                <svg
                  className="mt-0.5 shrink-0 text-primary"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{hub.address}</span>
              </p>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Bunal.club hub</p>
            )}
          </div>

          {hub.bookable && (
            <a
              href="#booking"
              className="flex min-h-12 w-full shrink-0 items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover md:w-auto"
            >
              Book now
            </a>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <div className="space-y-12 lg:col-span-2">
            {hub.about && (
              <section>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  About the venue
                </p>
                <p className="mt-4 whitespace-pre-line text-base leading-8 text-gray-600 sm:text-lg">
                  {hub.about}
                </p>
              </section>
            )}

            {hub.courts.length > 0 && (
              <section>
                <div className="flex items-end justify-between gap-4">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                    Courts
                  </p>
                  <span className="text-sm font-medium text-gray-400">
                    {hub.courts.length}{" "}
                    {hub.courts.length === 1 ? "court" : "courts"}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {hub.courts.map((court) => (
                    <article
                      key={court.id}
                      className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="text-lg font-bold text-navy">
                          {court.name}
                        </h2>
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                          {COURT_TYPE_LABELS[court.courtType] ??
                            court.courtType}
                        </span>
                      </div>
                      <p className="mt-2 text-xl font-bold text-primary">
                        {court.hourlyRate != null
                          ? formatPHP(court.hourlyRate)
                          : "Rate on request"}
                        {court.hourlyRate != null && (
                          <span className="text-xs font-normal text-gray-400">
                            {" "}
                            / hour
                          </span>
                        )}
                      </p>
                      {hours && (
                        <dl className="mt-4 space-y-1 border-t border-gray-100 pt-4 text-xs text-gray-500">
                          {summarizeOperatingHours(hours).map(
                            (segment, index) => (
                              <div
                                key={index}
                                className="flex justify-between gap-3"
                              >
                                <dt>{segment.label}</dt>
                                <dd className="text-right font-medium text-gray-700">
                                  {segment.value}
                                </dd>
                              </div>
                            )
                          )}
                        </dl>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {(hub.address || hasCoords) && (
              <section>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  Location &amp; map
                </p>
                <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {mapsKey && hasCoords ? (
                    <iframe
                      title={`Map of ${hub.name}`}
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      className="h-80 w-full"
                      src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${hub.latitude},${hub.longitude}&zoom=16`}
                    />
                  ) : (
                    <div className="flex min-h-64 flex-col items-center justify-center bg-navy-soft/60 px-6 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary shadow-sm">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </span>
                      {hub.address && (
                        <p className="mt-4 max-w-md text-sm font-medium text-navy">
                          {hub.address}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    {hub.address && (
                      <p className="text-sm text-gray-500">{hub.address}</p>
                    )}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        mapsQuery
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-primary hover:underline"
                    >
                      Open in Google Maps →
                    </a>
                  </div>
                </div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                Contact information
              </h2>
              <dl className="mt-5 space-y-5">
                {hub.phone && (
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        Phone
                      </dt>
                      <dd className="mt-1">
                        <a
                          href={`tel:${hub.phone}`}
                          className="break-words text-sm font-semibold text-navy hover:text-primary"
                        >
                          {hub.phone}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                {hub.email && (
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </span>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                        Email
                      </dt>
                      <dd className="mt-1">
                        <a
                          href={`mailto:${hub.email}`}
                          className="break-words text-sm font-semibold text-navy hover:text-primary"
                        >
                          {hub.email}
                        </a>
                      </dd>
                    </div>
                  </div>
                )}
                {!hub.phone && !hub.email && (
                  <p className="text-sm text-gray-400">
                    No contact information provided.
                  </p>
                )}
              </dl>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                Operating hours
              </h2>
              {hours ? (
                <dl className="mt-5 space-y-3 text-sm">
                  {WEEKDAYS.map(({ value, label }) => {
                    const day = hours[value as Weekday];
                    return (
                      <div
                        key={value}
                        className="flex items-center justify-between gap-4"
                      >
                        <dt className="text-gray-500">{label}</dt>
                        <dd className="text-right font-semibold text-navy">
                          {!day || day.closed
                            ? "Closed"
                            : `${formatTime(day.open)} – ${formatTime(day.close)}`}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : (
                <p className="mt-5 text-sm text-gray-400">Hours not set.</p>
              )}
            </section>
          </aside>
        </div>
      </div>

      {/* Unlisted hubs still render by direct URL, but cannot take bookings. */}
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
        <section className="border-y border-gray-200 bg-white py-14">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              Online booking unavailable
            </p>
            <h2 className="mt-2 text-2xl font-bold text-navy">
              Contact the venue to reserve a court
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              This venue isn&apos;t taking online bookings right now. Use the
              contact information above to reach them directly.
            </p>
            {/* Only the owner/admin needs the operational reason. */}
            {isOwner && (
              <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <span className="text-gray-500">
                  {hub.blockedBy === "gateway"
                    ? "Your hub isn't listed publicly because no payment gateway is connected."
                    : hub.blockedBy === "setup"
                      ? "Add at least one court, its rate, and operating hours before publishing your hub."
                      : hub.blockedBy === "settlement"
                        ? "New bookings are paused because a service-fee settlement is overdue."
                        : "This partner account is waiting for admin verification."}
                </span>{" "}
                {hub.blockedBy === "gateway" && (
                  <Link
                    href="/dashboard/payments"
                    className="font-semibold text-primary hover:underline"
                  >
                    Connect PayMongo →
                  </Link>
                )}
                {hub.blockedBy === "setup" && (
                  <Link
                    href={`/dashboard/hubs/${hub.id}/edit`}
                    className="font-semibold text-primary hover:underline"
                  >
                    Finish hub setup →
                  </Link>
                )}
                {hub.blockedBy === "settlement" && (
                  <Link
                    href="/dashboard/payments"
                    className="font-semibold text-primary hover:underline"
                  >
                    Submit settlement →
                  </Link>
                )}
              </p>
            )}
          </div>
        </section>
      )}

      {viewer === null && (
        <footer className="bg-navy py-10 text-center text-sm text-white/45">
          <p>© {new Date().getFullYear()} Bunal.club · Play. Compete. Connect.</p>
        </footer>
      )}
    </PageShell>
  );
}
