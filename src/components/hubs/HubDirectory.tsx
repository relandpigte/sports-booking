"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { HubCard } from "@/components/hubs/HubCard";
import {
  COURT_TYPES,
  GAMES,
  type OperatingHours,
} from "@/lib/constants";

export type DirectoryHubView = {
  id: string;
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
  operatingHours: OperatingHours | null;
  courts: {
    id: string;
    name: string;
    courtType: string;
    hourlyRate: number | null;
  }[];
  createdAt: string;
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
  const rates = hub.courts
    .map((court) => court.hourlyRate)
    .filter((rate): rate is number => rate != null);
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
      <header className="py-8 sm:py-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          Courts across Bohol
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-navy sm:text-4xl">
          Find a hub
        </h1>
        <p className="mt-3 text-base text-slate-500 sm:text-lg">
          Discover local courts, compare rates, and book your game online.
        </p>
      </header>

      <form action="/hubs" method="get" className="space-y-4">
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
        <div className="grid gap-3 lg:grid-cols-[minmax(320px,1fr)_auto_auto_minmax(190px,0.3fr)]">
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
              className="min-h-14 w-full rounded-2xl border border-[#dfe7e2] bg-white py-3 pl-12 pr-4 text-sm text-navy shadow-sm shadow-navy/5 placeholder:text-slate-400 focus:border-primary focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={requestLocation}
            disabled={locating}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            <LocationIcon />
            {locating ? "Finding you…" : "Nearest first"}
          </button>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary-soft px-5 text-sm font-bold text-primary transition-colors hover:bg-accent-soft"
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
              className="min-h-14 w-full appearance-none rounded-2xl border border-[#dfe7e2] bg-white px-4 pr-10 text-sm font-bold text-navy shadow-sm shadow-navy/5 focus:border-primary focus:outline-none"
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
          <div className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
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

      <section className="mt-10 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Book online
            </p>
            <h2 className="mt-1 text-2xl font-black text-navy">
              Available hubs
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
                hub={{ ...hub, createdAt: new Date(hub.createdAt) }}
                distanceKm={
                  coordinates
                    ? distanceKm(coordinates, hub) ?? undefined
                    : undefined
                }
                availableSlots={hub.availableSlots}
                availabilityDate={initial.date || today}
                today={today}
              />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <p className="font-bold text-navy">No matching hubs found</p>
            <p className="mt-2 text-sm text-slate-500">
              Try a different search, date, time, or court filter.
            </p>
            <Link
              href="/hubs"
              className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-white"
            >
              Clear all filters
            </Link>
          </div>
        )}
      </section>
    </div>
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
