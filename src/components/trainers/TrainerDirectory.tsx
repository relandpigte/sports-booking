"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { GAME_LABELS, GAME_VALUES } from "@/lib/constants";

export type TrainerDirectoryView = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  area: string;
  hourlyRate: number;
  bio: string;
  sports: string[];
  specialties: string[];
  order: number;
};

type Sort = "newest" | "name" | "rate-asc" | "rate-desc";

type FilterValues = {
  sport: string;
  area: string;
  date: string;
  maxRate: string;
};

export function TrainerDirectory({
  trainers,
  today,
  availableDateLabel,
  initial,
}: {
  trainers: TrainerDirectoryView[];
  today: string;
  availableDateLabel: string | null;
  initial: {
    query: string;
    sport: string;
    area: string;
    date: string;
    maxRate: string;
    sort: Sort;
  };
}) {
  const [query, setQuery] = useState(initial.query);
  const [sort, setSort] = useState<Sort>(initial.sort);
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(initial.sport || initial.area || initial.date || initial.maxRate)
  );
  const [filters, setFilters] = useState<FilterValues>({
    sport: initial.sport,
    area: initial.area,
    date: initial.date,
    maxRate: initial.maxRate,
  });

  const activeFilterCount = Object.values(filters).filter((value) =>
    value.trim()
  ).length;
  const hasActiveDiscovery = Boolean(query.trim() || activeFilterCount);

  const visibleTrainers = useMemo(() => {
    const terms = query
      .trim()
      .toLocaleLowerCase("en-PH")
      .split(/\s+/)
      .filter(Boolean);
    const filtered = terms.length
      ? trainers.filter((trainer) => {
          const searchable = [
            trainer.name,
            trainer.area,
            ...trainer.sports.map((sport) => GAME_LABELS[sport] ?? sport),
            ...trainer.specialties,
          ]
            .join(" ")
            .toLocaleLowerCase("en-PH");
          return terms.every((term) => searchable.includes(term));
        })
      : [...trainers];

    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "en-PH");
      if (sort === "rate-asc") return a.hourlyRate - b.hourlyRate;
      if (sort === "rate-desc") return b.hourlyRate - a.hourlyRate;
      return a.order - b.order;
    });
  }, [query, sort, trainers]);

  const updateFilter = (field: keyof FilterValues, value: string) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  return (
    <div>
      <header className="relative mt-6 overflow-hidden rounded-[28px] bg-navy px-6 pb-24 pt-10 sm:mt-8 sm:px-10 sm:pb-28 sm:pt-12 lg:px-14">
        <div
          aria-hidden="true"
          className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-primary/20 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-accent">
            Verified coaching
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] text-white sm:text-5xl">
            Find the right trainer for your game.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-white/70 sm:text-lg">
            Discover admin-reviewed trainers by sport, specialty, area,
            availability, and hourly rate.
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/80 backdrop-blur-sm">
            <VerifiedIcon className="h-4 w-4 text-accent" />
            Verified trainer profiles on Bunal.club
          </div>
        </div>
      </header>

      <form
        action="/trainers"
        method="get"
        className="relative z-10 -mt-10 space-y-4 px-3 sm:px-5 lg:px-8"
      >
        {!filtersOpen && (
          <>
            <input type="hidden" name="sport" value={filters.sport} />
            <input type="hidden" name="area" value={filters.area} />
            <input type="hidden" name="date" value={filters.date} />
            <input type="hidden" name="maxRate" value={filters.maxRate} />
          </>
        )}

        <div className="grid gap-2 rounded-2xl border border-[#dfe7e2] bg-white p-2.5 shadow-xl shadow-navy/8 lg:grid-cols-[minmax(320px,1fr)_auto_minmax(190px,0.3fr)]">
          <label className="relative block">
            <span className="sr-only">
              Search trainer name, specialty, sport, or area
            </span>
            <SearchIcon />
            <input
              type="search"
              name="q"
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, specialty, sport, or area"
              className="min-h-12 w-full rounded-xl border border-[#dfe7e2] bg-white py-3 pl-12 pr-4 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="trainer-filters"
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
            <span className="sr-only">Sort trainers</span>
            <select
              name="sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="min-h-12 w-full appearance-none rounded-xl border border-[#dfe7e2] bg-white px-4 pr-10 text-sm font-bold text-navy focus:border-primary focus:outline-none"
            >
              <option value="newest">Newest first</option>
              <option value="name">Name (A–Z)</option>
              <option value="rate-asc">Rate (low to high)</option>
              <option value="rate-desc">Rate (high to low)</option>
            </select>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
            >
              ↓
            </span>
          </label>
        </div>

        {filtersOpen && (
          <div
            id="trainer-filters"
            className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-lg shadow-navy/5 sm:p-6"
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <FilterField label="Sport">
                <select
                  name="sport"
                  value={filters.sport}
                  onChange={(event) => updateFilter("sport", event.target.value)}
                  className="filter-control"
                >
                  <option value="">Any sport</option>
                  {GAME_VALUES.map((game) => (
                    <option key={game} value={game}>
                      {GAME_LABELS[game]}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Area">
                <input
                  name="area"
                  value={filters.area}
                  onChange={(event) => updateFilter("area", event.target.value)}
                  placeholder="Any area"
                  className="filter-control"
                />
              </FilterField>

              <FilterField label="Available date">
                <input
                  type="date"
                  name="date"
                  min={today}
                  value={filters.date}
                  onChange={(event) => updateFilter("date", event.target.value)}
                  className="filter-control"
                />
              </FilterField>

              <FilterField label="Maximum hourly rate">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">
                    ₱
                  </span>
                  <input
                    type="number"
                    name="maxRate"
                    min="1"
                    step="1"
                    value={filters.maxRate}
                    onChange={(event) =>
                      updateFilter("maxRate", event.target.value)
                    }
                    placeholder="Any rate"
                    className="filter-control pl-8"
                  />
                </div>
              </FilterField>
            </div>

            <div className="mt-5 flex flex-col-reverse gap-3 border-t border-[#dfe7e2] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <Link
                href="/trainers"
                className="inline-flex min-h-11 items-center justify-center px-4 text-sm font-bold text-slate-500 transition-colors hover:text-navy"
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

      <section className="mt-14 pb-8 sm:mt-16" aria-labelledby="trainer-results-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Verified trainers
            </p>
            <h2
              id="trainer-results-heading"
              className="mt-1 text-2xl font-black tracking-[-0.025em] text-navy"
            >
              Explore trainers
            </h2>
          </div>
          <p className="text-sm text-slate-500" aria-live="polite">
            {visibleTrainers.length}{" "}
            {visibleTrainers.length === 1 ? "trainer" : "trainers"} found
          </p>
        </div>

        {visibleTrainers.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibleTrainers.map((trainer) => (
              <TrainerCard
                key={trainer.id}
                trainer={trainer}
                availableDateLabel={availableDateLabel}
              />
            ))}
          </div>
        ) : (
          <TrainerEmptyState filtered={hasActiveDiscovery} />
        )}
      </section>

      <aside className="mb-12 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ocean-soft text-ocean">
              <PeopleIcon />
            </span>
            <div>
              <h2 className="text-lg font-black text-navy">
                Interested in coaching on Bunal.club?
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Players can sign up as trainers, set their availability and
                hourly rate, and submit a profile for verification.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/trainer"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-navy bg-white px-5 text-sm font-bold text-navy transition-colors hover:bg-navy-soft"
          >
            Become a trainer <span aria-hidden="true">→</span>
          </Link>
        </div>
      </aside>
    </div>
  );
}

function TrainerCard({
  trainer,
  availableDateLabel,
}: {
  trainer: TrainerDirectoryView;
  availableDateLabel: string | null;
}) {
  return (
    <article className="group flex min-h-full flex-col rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div className="flex items-start gap-4">
        <Avatar
          src={trainer.image}
          name={trainer.name}
          size={64}
          className="ring-4 ring-primary-soft"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-black text-navy">
              {trainer.name}
            </h3>
            <Badge tone="success" className="gap-1 py-1 text-[11px] font-bold">
              <VerifiedIcon className="h-3.5 w-3.5" />
              Verified
            </Badge>
          </div>
          <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-500">
            <MapPinIcon />
            <span>{trainer.area} · In person</span>
          </p>
          <p className="mt-2 text-lg font-black text-primary">
            ₱
            {trainer.hourlyRate.toLocaleString("en-PH", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
            <span className="text-xs font-semibold text-slate-400"> / hour</span>
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">
        {trainer.bio}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {trainer.sports.map((sport) => (
          <span
            key={sport}
            className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary"
          >
            {GAME_LABELS[sport] ?? sport}
          </span>
        ))}
      </div>

      {availableDateLabel && (
        <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <CalendarIcon />
          Available on {availableDateLabel}
        </p>
      )}

      <div className="mt-auto pt-5">
        <Link
          href={`/players/${trainer.username}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#dfe7e2] bg-white px-4 text-sm font-bold text-navy transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
        >
          View profile <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}

function TrainerEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="mt-8 rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center sm:py-16">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy-soft text-navy">
        <SearchEmptyIcon />
      </span>
      <h3 className="mt-5 text-xl font-black text-navy">
        {filtered ? "No trainers match those filters" : "Trainers are joining the club"}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {filtered
          ? "Try another name, specialty, sport, area, date, or hourly rate."
          : "Verified trainer profiles will appear here as soon as they are ready to accept session requests."}
      </p>
      {filtered && (
        <Link
          href="/trainers"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl border border-[#dfe7e2] bg-white px-5 text-sm font-bold text-navy transition-colors hover:bg-[#f7faf8]"
        >
          Clear all filters
        </Link>
      )}
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

function VerifiedIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m9 12 2 2 4-5" />
      <path d="M12 3.5 14.2 5l2.7-.1.8 2.6 2.2 1.6-.9 2.6.9 2.6-2.2 1.6-.8 2.6-2.7-.1L12 20l-2.2-1.5-2.7.1-.8-2.6-2.2-1.6.9-2.6-.9-2.6 2.2-1.6.8-2.6 2.7.1L12 3.5Z" />
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0"
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

function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4 text-primary"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18m-11 5 2 2 4-4" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
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
