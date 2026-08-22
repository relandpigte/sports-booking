"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

type PlayerBookingSection = "upcoming" | "history";
type BookingType = "all" | "courts" | "events" | "trainers";

type PlayerBookingFilterValues = {
  query: string;
  type: BookingType;
  status: string;
  from: string;
  to: string;
};

export function PlayerBookingsView({
  section,
  upcomingCount,
  historyCount,
  courtCount,
  eventCount,
  trainerCount,
  courtBookings,
  eventRegistrations,
  trainerSessions,
  filters,
  upcomingHref,
  historyHref,
  clearHref,
}: {
  section: PlayerBookingSection;
  upcomingCount: number;
  historyCount: number;
  courtCount: number;
  eventCount: number;
  trainerCount: number;
  courtBookings: ReactNode;
  eventRegistrations: ReactNode;
  trainerSessions: ReactNode;
  filters: PlayerBookingFilterValues;
  upcomingHref: string;
  historyHref: string;
  clearHref: string;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const resultCount = courtCount + eventCount + trainerCount;
  const activeAdvancedFilters = [
    filters.type !== "all" ? bookingTypeLabel(filters.type) : null,
    filters.status ? statusLabel(filters.status) : null,
    filters.from ? `From ${filters.from}` : null,
    filters.to ? `To ${filters.to}` : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Your schedule"
        title="Bookings"
        description="Find and manage your court reservations and event registrations in one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/hubs"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-slate-50"
            >
              Find a court
            </Link>
            <Link
              href="/events"
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white hover:bg-primary-hover"
            >
              Explore events
            </Link>
            <Link
              href="/trainers"
              className="rounded-lg border border-primary/20 bg-primary-soft px-3 py-2 text-xs font-semibold text-primary hover:bg-accent-soft"
            >
              Find a trainer
            </Link>
          </div>
        }
      />

      <nav
        className="mt-7 flex gap-6 border-b border-slate-200"
        aria-label="Booking periods"
      >
        <PeriodTab
          href={upcomingHref}
          active={section === "upcoming"}
          label="Upcoming"
          count={upcomingCount}
        />
        <PeriodTab
          href={historyHref}
          active={section === "history"}
          label="History"
          count={historyCount}
        />
      </nav>

      <form
        method="get"
        className="mt-5 rounded-2xl border border-[#dfe7e2] bg-white p-3 shadow-sm shadow-navy/5 sm:p-4"
      >
        <input type="hidden" name="tab" value={section} />
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle
                cx="8.5"
                cy="8.5"
                r="5"
                stroke="currentColor"
                strokeWidth="1.7"
              />
              <path
                d="m12.2 12.2 4 4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Search venue, court, event, or booking reference"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            aria-expanded={showAdvanced}
            aria-controls="player-booking-advanced-search"
            onClick={() => setShowAdvanced((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-navy hover:bg-slate-50"
          >
            <FilterIcon />
            Advanced search
            {activeAdvancedFilters.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">
                {activeAdvancedFilters.length}
              </span>
            )}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 transition-transform ${
                showAdvanced ? "rotate-180" : ""
              }`}
            >
              <path
                d="m6 8 4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div
          id="player-booking-advanced-search"
          className={`${
            showAdvanced ? "grid" : "hidden"
          } mt-3 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4`}
        >
          <Select
            name="type"
            value={filters.type}
            label="All booking types"
            options={[
              { value: "courts", label: "Courts" },
              { value: "events", label: "Events" },
              { value: "trainers", label: "Trainers" },
            ]}
          />
          <Select
            name="status"
            value={filters.status}
            label="Any status"
            options={[
              { value: "PENDING", label: "Pending" },
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "WAITLISTED", label: "Waitlisted" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "EXPIRED", label: "Expired" },
              { value: "REFUNDED", label: "Refunded" },
            ]}
          />
          <label className="text-xs font-semibold text-slate-500">
            From date
            <input
              type="date"
              name="from"
              defaultValue={filters.from}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-navy"
            />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            To date
            <input
              type="date"
              name="to"
              defaultValue={filters.to}
              className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-navy"
            />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
            <Link
              href={clearHref}
              className="inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-navy"
            >
              Clear filters
            </Link>
            <button
              type="submit"
              className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover"
            >
              Show results
            </button>
          </div>
        </div>

        {(filters.query || activeAdvancedFilters.length > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {filters.query && (
              <span className="rounded-full border border-primary/15 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                Search: {filters.query}
              </span>
            )}
            {activeAdvancedFilters.map((filter) => (
              <span
                key={filter}
                className="rounded-full border border-primary/15 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary"
              >
                {filter}
              </span>
            ))}
            <Link
              href={clearHref}
              className="px-1 text-[11px] font-semibold text-slate-500 hover:text-navy"
            >
              Clear all
            </Link>
          </div>
        )}
      </form>

      <section className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            {section === "upcoming" ? "Upcoming" : "History"} ({resultCount})
          </h2>
        </div>

        {resultCount > 0 ? (
          <div className="mt-3 space-y-5">
            {courtCount > 0 && (
              <BookingGroup title={eventCount + trainerCount > 0 ? "Court bookings" : undefined}>
                {courtBookings}
              </BookingGroup>
            )}
            {eventCount > 0 && (
              <BookingGroup
                  title={courtCount + trainerCount > 0 ? "Event registrations" : undefined}
              >
                {eventRegistrations}
              </BookingGroup>
            )}
            {trainerCount > 0 && (
              <BookingGroup title={courtCount + eventCount > 0 ? "Trainer sessions" : undefined}>
                {trainerSessions}
              </BookingGroup>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm font-semibold text-navy">
              No {section} bookings found
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Try another search or clear your filters.
            </p>
            <Link
              href={clearHref}
              className="mt-3 inline-flex rounded-lg bg-primary-soft px-3 py-2 text-xs font-bold text-primary hover:bg-accent-soft"
            >
              Clear search
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function PeriodTab({
  href,
  active,
  label,
  count,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${
        active
          ? "border-primary text-navy"
          : "border-transparent text-slate-500 hover:text-navy"
      }`}
    >
      {label}
      <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
        {count}
      </span>
    </Link>
  );
}

function Select({
  name,
  value,
  label,
  options,
}: {
  name: string;
  value: string;
  label: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="text-xs font-semibold text-slate-500">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-navy"
      >
        <option value={name === "type" ? "all" : ""}>{label}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M3 5h14M5.5 10h9M8 15h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function bookingTypeLabel(value: BookingType) {
  if (value === "courts") return "Courts";
  if (value === "events") return "Events";
  if (value === "trainers") return "Trainers";
  return "All booking types";
}

function statusLabel(value: string) {
  return `Status: ${value.toLocaleLowerCase("en-PH")}`;
}

function BookingGroup({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div>
      {title && (
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
          {title}
        </h3>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{children}</div>
    </div>
  );
}
