"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { HubCard } from "@/components/hubs/HubCard";
import {
  COURT_TYPES,
  GAMES,
  type OperatingHours,
} from "@/lib/constants";
import type { CourtScheduleRule } from "@/lib/slots";

export type DirectoryHubView = {
  id: string;
  slug: string | null;
  name: string;
  about: string | null;
  logo: string | null;
  coverPhotos: string[];
  games: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  bookingStatus: "OPEN" | "COMING_SOON" | "MAINTENANCE";
  bookingStatusMessage: string | null;
  operatingHours: OperatingHours | null;
  courts: {
    id: string;
    name: string;
    courtType: string;
    hourlyRate: number | null;
    scheduleRules: CourtScheduleRule[];
  }[];
  createdAt: string;
  updatedAt: string;
  bookable: boolean;
  comingSoon: boolean;
  verified: boolean;
  availableSlots: number | null;
};

type Coordinates = { latitude: number; longitude: number };
type Sort = "name" | "price" | "newest" | "distance";

function distanceKm(from: Coordinates, hub: DirectoryHubView): number | null {
  if (hub.latitude == null || hub.longitude == null) return null;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(hub.latitude - from.latitude);
  const longitudeDelta = radians(hub.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(hub.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function startingRate(hub: DirectoryHubView): number {
  const rates = hub.courts.flatMap((court) => [
    ...(court.hourlyRate != null ? [court.hourlyRate] : []),
    ...court.scheduleRules.flatMap((rule) =>
      !rule.closed && rule.hourlyRate != null ? [rule.hourlyRate] : []
    ),
  ]);
  return rates.length ? Math.min(...rates) : Number.POSITIVE_INFINITY;
}

export function HubDirectory({
  hubs,
  initial,
  today,
}: {
  hubs: DirectoryHubView[];
  initial: {
    query: string;
    game: string;
    courtType: string;
    date: string;
    from: string;
    to: string;
    sort: Sort;
  };
  today: string;
}) {
  const [query, setQuery] = useState(initial.query);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      initial.game ||
        initial.courtType ||
        initial.date ||
        initial.from ||
        initial.to
    )
  );
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  const activeFilterCount = [
    initial.game,
    initial.courtType,
    initial.date,
    initial.from,
    initial.to,
  ].filter(Boolean).length;
  const hasActiveDiscovery = Boolean(query.trim() || activeFilterCount);

  const visibleHubs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? hubs.filter((hub) =>
          [
            hub.name,
            hub.address,
            hub.about,
            ...hub.games,
            ...hub.courts.map((court) => court.name),
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(needle))
        )
      : [...hubs];

    return filtered.sort((a, b) => {
      if (sort === "price") return startingRate(a) - startingRate(b);
      if (sort === "newest") {
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
      if (sort === "distance" && coordinates) {
        return (
          (distanceKm(coordinates, a) ?? Number.POSITIVE_INFINITY) -
          (distanceKm(coordinates, b) ?? Number.POSITIVE_INFINITY)
        );
      }
      return a.name.localeCompare(b.name);
    });
  }, [coordinates, hubs, query, sort]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage("Location is not supported by this browser.");
      return;
    }
    setLocating(true);
    setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        setSort("distance");
        setLocating(false);
      },
      () => {
        setLocationMessage(
          "We could not access your location. Check browser permission and try again."
        );
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 }
    );
  };

  return (
    <div>
      <header className="relative mt-6 overflow-hidden rounded-[28px] bg-navy px-6 pb-24 pt-12 sm:mt-8 sm:px-10 sm:pb-28 sm:pt-16 lg:px-14">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">
            Discover Philippine sports
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl">
            Find your next hub.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
            Search live court availability, compare rates, and book your game
            without the back-and-forth.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-accent" />
            Live availability from local venues
          </div>
        </div>
      </header>

      <form
        action="/hubs"
        method="get"
        className="relative z-10 -mt-10 space-y-4 px-3 sm:px-5 lg:px-8"
      >
        {!filtersOpen && (
          <>
            <input type="hidden" name="game" value={initial.game} />
            <input
              type="hidden"
              name="courtType"
              value={initial.courtType}
            />
            <input type="hidden" name="date" value={initial.date} />
            <input type="hidden" name="from" value={initial.from} />
            <input type="hidden" name="to" value={initial.to} />
          </>
        )}
        <div className="grid gap-2 rounded-2xl border border-[#dfe7e2] bg-white p-2.5 shadow-xl shadow-navy/8 lg:grid-cols-[minmax(320px,1fr)_auto_auto_minmax(180px,0.3fr)]">
          <label className="relative block">
            <span className="sr-only">
              Search by hub, court, or location
            </span>
            <SearchIcon />
            <input
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by hub, court, or location"
              className="min-h-12 w-full rounded-xl border border-[#dfe7e2] bg-white py-3 pl-12 pr-4 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={requestLocation}
            disabled={locating}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            <LocationIcon />
            {locating ? "Finding you…" : "Nearest first"}
          </button>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#dfe7e2] bg-white px-5 text-sm font-bold text-navy transition-colors hover:border-primary/30 hover:bg-primary-soft"
          >
            <FilterIcon />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          <label className="relative">
            <span className="sr-only">Sort hubs</span>
            <select
              name="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="min-h-12 w-full appearance-none rounded-xl border border-[#dfe7e2] bg-white px-4 pr-10 text-sm font-bold text-navy focus:border-primary focus:outline-none"
            >
              <option value="name">Name (A–Z)</option>
              <option value="price">Price (low first)</option>
              <option value="newest">Newest first</option>
              {coordinates && <option value="distance">Nearest first</option>}
            </select>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
            >
              ↓
            </span>
          </label>
        </div>

        {locationMessage && (
          <p role="status" className="text-sm text-amber-700">
            {locationMessage}
          </p>
        )}

        {filtersOpen && (
          <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-lg shadow-navy/5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <FilterField label="Date">
                <input
                  type="date"
                  name="date"
                  min={today}
                  defaultValue={initial.date}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Sport">
                <select
                  name="game"
                  defaultValue={initial.game}
                  className="filter-control"
                >
                  <option value="">Any sport</option>
                  {GAMES.map((game) => (
                    <option key={game.value} value={game.value}>
                      {game.label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Court type">
                <select
                  name="courtType"
                  defaultValue={initial.courtType}
                  className="filter-control"
                >
                  <option value="">All courts</option>
                  {COURT_TYPES.map((courtType) => (
                    <option key={courtType.value} value={courtType.value}>
                      {courtType.label}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="From">
                <input
                  type="time"
                  name="from"
                  step="3600"
                  defaultValue={initial.from}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="To">
                <input
                  type="time"
                  name="to"
                  step="3600"
                  defaultValue={initial.to}
                  className="filter-control"
                />
              </FilterField>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#dfe7e2] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/hubs"
                className="inline-flex min-h-11 items-center justify-center text-sm font-bold text-slate-500 hover:text-navy"
              >
                Clear filters
              </Link>
              <button
                type="submit"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-navy px-5 text-sm font-bold text-white transition-colors hover:bg-navy-hover"
              >
                Apply filters
              </button>
            </div>
          </div>
        )}
      </form>

      <section className="mt-16 pb-20 sm:mt-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Discover courts nationwide
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.025em] text-navy">
              Explore sports hubs
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {visibleHubs.length}{" "}
            {visibleHubs.length === 1 ? "hub" : "hubs"} found
          </p>
        </div>

        {visibleHubs.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {visibleHubs.map((hub) => (
              <HubCard
                key={hub.id}
                hub={{
                  ...hub,
                  createdAt: new Date(hub.createdAt),
                  updatedAt: new Date(hub.updatedAt),
                }}
                distanceKm={
                  coordinates
                    ? distanceKm(coordinates, hub) ?? undefined
                    : undefined
                }
                availableSlots={hub.availableSlots}
                availabilityDate={initial.date || today}
                today={today}
                comingSoon={hub.comingSoon}
                verified={hub.verified}
              />
            ))}
          </div>
        ) : hasActiveDiscovery ? (
          <FilteredEmptyState />
        ) : (
          <EmptyDirectoryState />
        )}
      </section>
    </div>
  );
}

function EmptyDirectoryState() {
  const sports = ["Pickleball", "Badminton", "Volleyball", "Tennis"];

  return (
    <div className="mt-8 overflow-hidden rounded-[28px] border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5">
      <div className="grid lg:grid-cols-2">
        <div className="p-7 sm:p-10 lg:p-12">
          <div className="max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary">
              <span className="h-2 w-2 rounded-full bg-accent" />
              Growing across the Philippines
            </span>
            <h3 className="mt-6 text-3xl font-black tracking-[-0.035em] text-navy sm:text-4xl">
              Local hubs are joining the club.
            </h3>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-500">
              We&apos;re onboarding venue partners so players can discover live
              schedules, reserve court time, and pay online in one place.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {sports.map((sport) => (
                <span
                  key={sport}
                  className="rounded-full border border-[#dfe7e2] bg-[#f7faf8] px-3.5 py-1.5 text-xs font-bold text-navy"
                >
                  {sport}
                </span>
              ))}
            </div>

            <Link
              href="/#how-it-works"
              className="mt-9 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-ocean transition-colors hover:text-navy"
            >
              See how booking works <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>

        <aside className="relative overflow-hidden bg-navy p-7 text-white sm:p-10 lg:p-12">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
          />
          <div className="relative max-w-lg">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">
              For venue partners
            </p>
            <h3 className="mt-4 text-2xl font-black tracking-[-0.025em] sm:text-3xl">
              Put your courts where players can find them.
            </h3>
            <p className="mt-4 text-sm leading-6 text-white/65">
              Set up your venue, receive bookings online, and have player
              payments sent to your connected PayMongo account.
            </p>

            <ol className="mt-8 space-y-5">
              <PartnerStep number="1" text="Connect your PayMongo account" />
              <PartnerStep number="2" text="Add your hub, courts, and rates" />
              <PartnerStep
                number="3"
                text="Publish availability and accept bookings"
              />
            </ol>

            <Link
              href="/register/partner"
              className="mt-9 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary-hover sm:w-auto"
            >
              List your venue
            </Link>
            <p className="mt-4 text-xs text-white/45">
              No monthly subscription. Bunal.club charges 3% for automatic
              checkout or 2.5% for manual checkout.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FilteredEmptyState() {
  return (
    <div className="mt-8 rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center sm:py-16">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-soft text-navy">
        <SearchEmptyIcon />
      </span>
      <h3 className="mt-5 text-xl font-black text-navy">
        No matching hubs found
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        Try adjusting your search, date, time, sport, or court type. Venue
        owners can also be among the first to list in this area.
      </p>
      <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/hubs"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#dfe7e2] bg-white px-5 text-sm font-bold text-navy transition-colors hover:bg-[#f7faf8] sm:w-auto"
        >
          Clear all filters
        </Link>
        <Link
          href="/register/partner"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-navy px-5 text-sm font-bold text-white transition-colors hover:bg-navy-hover sm:w-auto"
        >
          List your venue
        </Link>
      </div>
    </div>
  );
}

function PartnerStep({ number, text }: { number: string; text: string }) {
  return (
    <li className="flex items-center gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-accent">
        {number}
      </span>
      <span className="text-sm font-semibold text-white/80">{text}</span>
    </li>
  );
}

function SearchEmptyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5M8.5 8.5l4 4m0-4-4 4" />
    </svg>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M4 5h16l-6 7v5l-4 2v-7Z" />
    </svg>
  );
}
