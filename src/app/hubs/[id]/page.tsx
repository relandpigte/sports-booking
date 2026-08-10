import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import { PageShell } from "@/components/PageShell";
import { BookCourtPanel } from "@/components/hubs/BookCourtPanel";
import { HubPhotoGallery } from "@/components/hubs/HubPhotoGallery";
import { VerifiedBadge } from "@/components/hubs/HubCard";
import { Avatar } from "@/components/ui/Avatar";
import { getPublicHub, type Hub } from "@/lib/hubs";
import { getViewer } from "@/lib/dal";
import { getHubCourtOccupancies } from "@/lib/bookings";
import { formatPHP } from "@/lib/currency";
import { hubPublicPath } from "@/lib/hub-slug";
import { facebookPageLabel } from "@/lib/social";
import {
  DEFAULT_SOCIAL_IMAGE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
  conciseDescription,
  isPublicHttpUrl,
} from "@/lib/site";
import {
  formatSlotRange,
  manilaNowHour,
  manilaToday,
} from "@/lib/time";
import { weekdayIndexForDate } from "@/lib/slots";
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
  comingSoon = false,
}: {
  name: string;
  about: string | null;
  address: string | null;
  games: string[];
  comingSoon?: boolean;
}): string {
  const sports = games.map((game) => GAME_LABELS[game] ?? game).join(", ");
  const location = address ? ` in ${address}` : "";
  const introduction = about?.trim()
    ? about
    : comingSoon
      ? `Discover ${sports || "sports"} courts at ${name}${location}.`
      : `Book ${sports || "sports"} courts at ${name}${location}.`;

  return conciseDescription(
    comingSoon
      ? `${introduction} Explore the venue, courts, and rates. Online booking is coming soon.`
      : `${introduction} Check live availability, hourly rates, and secure online booking.`,
    165
  );
}

function closureNoticesForDate(courts: Hub["courts"], date: string): string[] {
  const weekday = weekdayIndexForDate(date);
  return courts.flatMap((court) => {
    const rules = court.scheduleRules
      .filter(
        (rule) =>
          rule.weekday === weekday &&
          rule.closed &&
          Boolean(rule.closureReason?.trim())
      )
      .sort((left, right) => left.hour - right.hour);
    if (rules.length === 0) return [];

    const notices: string[] = [];
    let start = rules[0].hour;
    let end = start + 1;
    let reason = rules[0].closureReason!.trim();
    for (const rule of rules.slice(1)) {
      const nextReason = rule.closureReason!.trim();
      if (rule.hour === end && nextReason === reason) {
        end += 1;
        continue;
      }
      notices.push(
        `${court.name} · ${formatSlotRange(start, end)} — ${reason}`
      );
      start = rule.hour;
      end = rule.hour + 1;
      reason = nextReason;
    }
    notices.push(
      `${court.name} · ${formatSlotRange(start, end)} — ${reason}`
    );
    return notices;
  });
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

  const title = hub.comingSoon
    ? `${hub.name} — Coming Soon | Bunal.club`
    : `${hub.name} — Court Booking & Availability | Bunal.club`;
  const description = hubDescription(hub);
  const canonical = hubPublicPath(hub);
  const socialImage =
    hub.coverPhotos.find(isPublicHttpUrl) ?? DEFAULT_SOCIAL_IMAGE;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: hub.publiclyListed, follow: true },
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

  const hours = hub.operatingHours;

  // This page is public, so getViewer (which returns null when signed out)
  // rather than getCurrentUser (which would redirect anonymous visitors).
  const today = manilaToday();
  const todayClosureNotices = closureNoticesForDate(hub.courts, today);
  const [viewer, initialAvailability] = await Promise.all([
    getViewer(),
    // Populate every court for the comparison view before its live stream
    // connects, so neither list nor grid flashes an empty schedule.
    hub.courts.length > 0 && hub.bookable
      ? getHubCourtOccupancies(
          hub.id,
          today,
          hub.courts.map((court) => court.id)
        )
      : null,
  ]);

  // The partner previewing their own hub, or an admin looking at it.
  const isOwner = viewer?.id === hub.ownerId || viewer?.role === "ADMIN";

  const hasCoords = hub.latitude != null && hub.longitude != null;
  const mapsQuery = hasCoords
    ? `${hub.latitude},${hub.longitude}`
    : (hub.address ?? "");
  const canonicalUrl = absoluteUrl(hubPublicPath(hub));
  const description = hubDescription(hub);
  const publicImages = hub.coverPhotos.filter(isPublicHttpUrl);
  const hourlyRates = hub.courts.flatMap((court) => [
    ...(court.hourlyRate != null ? [court.hourlyRate] : []),
    ...court.scheduleRules.flatMap((rule) =>
      !rule.closed && rule.hourlyRate != null ? [rule.hourlyRate] : []
    ),
  ]);
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
    hub.publiclyListed && hub.address
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
  return (
    <PageShell
      maxWidth="max-w-none"
      backgroundClass="bg-[#f7faf8]"
      padded={false}
    >
      <JsonLd data={hubJsonLd} />

      <HubPhotoGallery
        photos={hub.coverPhotos}
        hubName={hub.name}
        comingSoon={hub.comingSoon}
      />

      <div className="relative z-10 mx-auto mt-4 w-full max-w-5xl px-4 sm:px-6 md:-mt-10 md:px-8 lg:-mt-12 lg:px-12 xl:px-16">
        <div className="flex flex-col items-start gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-xl shadow-navy/10 sm:p-7 md:flex-row md:items-center md:gap-6">
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
              <div className="flex flex-wrap items-center gap-1.5">
                {hub.verified && <VerifiedBadge size="regular" />}
                {hub.comingSoon && (
                  <span className="inline-flex h-8 w-fit items-center rounded-full bg-navy px-3 text-[11px] font-black uppercase tracking-[0.12em] text-accent">
                    Coming soon
                  </span>
                )}
                {hub.games.map((game) => (
                  <span
                    key={game}
                    className="inline-flex h-8 items-center rounded-full bg-primary-soft px-3 text-[11px] font-bold uppercase tracking-wider text-primary"
                  >
                    {GAME_LABELS[game] ?? game}
                  </span>
                ))}
              </div>
            </div>

            {hub.address ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-gray-500 hover:text-primary sm:text-base"
              >
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
                <span className="underline-offset-2 hover:underline">
                  {hub.address}
                </span>
              </a>
            ) : (
              <p className="mt-2 text-sm text-gray-500">Bunal.club hub</p>
            )}
          </div>

          {hub.bookable ? (
            <a
              href="#booking"
              className="flex min-h-12 w-full shrink-0 items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover md:w-auto"
            >
              Book now
            </a>
          ) : hub.comingSoon ? (
            <span className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-xl bg-navy-soft px-6 py-3 text-sm font-bold text-navy md:w-auto">
              Bookings open soon
            </span>
          ) : null}
        </div>
        {todayClosureNotices.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700">
              Today&apos;s court closure
            </p>
            <ul className="mt-2 space-y-1 text-sm font-semibold">
              {todayClosureNotices.slice(0, 3).map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
            {todayClosureNotices.length > 3 && (
              <p className="mt-1 text-xs text-amber-700">
                +{todayClosureNotices.length - 3} more closure notices in the
                booking schedule below.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
          <div className="space-y-12">
            {(hub.about || hub.facebookPage) && (
              <section>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  About the venue
                </p>
                {hub.about && (
                  <p className="mt-4 whitespace-pre-line text-base leading-8 text-gray-600 sm:text-lg">
                    {hub.about}
                  </p>
                )}
                {hub.facebookPage && (
                  <a
                    href={hub.facebookPage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5 inline-flex min-h-11 items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-navy shadow-sm transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1877F2] text-white">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M14 8.25V6.5c0-.8.53-1 1-1h2.75V2.14A36.5 36.5 0 0 0 14.82 2C11.9 2 10 3.77 10 7v1.25H7V12h3v10h4V12h3.25l.5-3.75H14Z" />
                      </svg>
                    </span>
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Follow this venue
                      </span>
                      <span className="mt-0.5 block">
                        {facebookPageLabel(hub.facebookPage)}
                      </span>
                    </span>
                    <svg
                      className="ml-1 text-gray-400"
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 3h6v6" />
                      <path d="M10 14 21 3" />
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    </svg>
                  </a>
                )}
              </section>
            )}

          </div>

          <aside>
            <section className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white">
              <div className="p-6">
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
              </div>

              <div className="p-6">
                <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                  Court details
                </h2>
                {hub.courts.length > 0 ? (
                  <dl className="mt-5 space-y-4 text-sm">
                    {hub.courts.map((court) => (
                      <div
                        key={court.id}
                        className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4 last:border-0 last:pb-0"
                      >
                        <div className="min-w-0">
                          <dt className="font-semibold text-navy">
                            {court.name}
                          </dt>
                          <dd className="mt-1 inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                            {COURT_TYPE_LABELS[court.courtType] ??
                              court.courtType}
                          </dd>
                        </div>
                        <dd className="shrink-0 text-right font-semibold text-primary">
                          {court.hourlyRate != null
                            ? formatPHP(court.hourlyRate)
                            : "On request"}
                          {court.hourlyRate != null && (
                            <span className="block text-[10px] font-normal text-gray-400">
                              / hour
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-5 text-sm text-gray-400">
                    No courts added yet.
                  </p>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {/* Non-bookable hubs still render, but never expose booking controls. */}
      {hub.bookable ? (
        <BookCourtPanel
          hubId={hub.id}
          courts={hub.courts}
          operatingHours={hours}
          today={today}
          nowHour={manilaNowHour()}
          initialAvailability={
            initialAvailability
              ? {
                  hubId: hub.id,
                  date: today,
                  courts: initialAvailability,
                }
              : null
          }
          viewerRole={viewer?.role ?? null}
          paymentRequired={hub.paymentRequired}
          paymentMode={hub.paymentMode}
        />
      ) : (
        <section className="border-y border-gray-200 bg-white py-14">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
              {hub.comingSoon ? "Opening soon" : "Online booking unavailable"}
            </p>
            <h2 className="mt-2 text-2xl font-bold text-navy">
              {hub.comingSoon
                ? "Online booking is coming soon"
                : "This venue is not accepting new bookings"}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              {hub.comingSoon
                ? "The venue is finishing its payment setup. You can explore its courts and rates now, then check back soon to reserve online."
                : "New online reservations are paused right now. Please check back later."}
            </p>
            {/* Only the owner/admin needs the operational reason. */}
            {isOwner && (
              <p className="mt-5 rounded-xl bg-gray-50 px-4 py-3 text-sm">
                <span className="text-gray-500">
                  {hub.blockedBy === "gateway"
                    ? "Your hub is published as Coming soon. Finish your automatic or manual payment setup to verify the venue and open online booking."
                    : hub.blockedBy === "setup"
                      ? "Add at least one court, its rate, and operating hours before publishing your hub."
                      : hub.blockedBy === "settlement"
                        ? "New bookings are paused because a service-fee settlement is overdue."
                        : hub.blockedBy === "inactive"
                          ? "This partner account is deactivated. Its venues are hidden and new bookings are paused."
                          : "This partner account is waiting for admin verification."}
                </span>{" "}
                {hub.blockedBy === "gateway" && (
                  <Link
                    href="/dashboard/payments"
                    className="font-semibold text-primary hover:underline"
                  >
                    Configure payments →
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
