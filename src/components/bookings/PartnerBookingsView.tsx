"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import type {
  PartnerBookingPaymentFilter,
  PartnerBookingSection,
  PartnerBookingSort,
} from "@/lib/bookings";

type ViewMode = "list" | "grid";

type PartnerBookingFilterValues = {
  query: string;
  hubId: string;
  courtId: string;
  status: string;
  payment: PartnerBookingPaymentFilter | "";
  from: string;
  to: string;
  sort: PartnerBookingSort;
};

type FilterOption = { value: string; label: string };

function ListIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M7 5h9M7 10h9M7 15h9M4 5h.01M4 10h.01M4 15h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
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

export function PartnerBookingsView({
  section,
  upcomingCount,
  historyCount,
  resultCount,
  list,
  grid,
  filters,
  hubOptions,
  courtOptions,
  upcomingHref,
  historyHref,
  clearHref,
  previousHref,
  nextHref,
  page,
  pageCount,
  firstResult,
  lastResult,
}: {
  section: PartnerBookingSection;
  upcomingCount: number;
  historyCount: number;
  resultCount: number;
  list: ReactNode;
  grid: ReactNode;
  filters: PartnerBookingFilterValues;
  hubOptions: FilterOption[];
  courtOptions: FilterOption[];
  upcomingHref: string;
  historyHref: string;
  clearHref: string;
  previousHref: string | null;
  nextHref: string | null;
  page: number;
  pageCount: number;
  firstResult: number;
  lastResult: number;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [
    filters.hubId
      ? hubOptions.find((option) => option.value === filters.hubId)?.label
      : null,
    filters.courtId
      ? courtOptions.find((option) => option.value === filters.courtId)?.label
      : null,
    filters.status ? `Status: ${filters.status.toLowerCase()}` : null,
    filters.payment ? `Payment: ${filters.payment}` : null,
    filters.from ? `From ${filters.from}` : null,
    filters.to ? `To ${filters.to}` : null,
  ].filter((value): value is string => Boolean(value));

  const viewToggle = (
    <div
      role="group"
      aria-label="Booking view"
      className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm shadow-navy/5"
    >
      <ViewButton
        active={viewMode === "list"}
        onClick={() => setViewMode("list")}
        icon={<ListIcon />}
      >
        List
      </ViewButton>
      <ViewButton
        active={viewMode === "grid"}
        onClick={() => setViewMode("grid")}
        icon={<GridIcon />}
      >
        Grid
      </ViewButton>
    </div>
  );

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Venue operations"
        title="Bookings"
        description="Search, filter, and manage player reservations across all of your hubs."
        actions={viewToggle}
      />

      <nav className="mt-7 flex gap-6 border-b border-slate-200" aria-label="Booking periods">
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

      <form method="get" className="mt-5 rounded-2xl border border-[#dfe7e2] bg-white p-3 shadow-sm shadow-navy/5 sm:p-4">
        <input type="hidden" name="tab" value={section} />
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <circle cx="8.5" cy="8.5" r="5" stroke="currentColor" strokeWidth="1.7" />
              <path d="m12.2 12.2 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={filters.query}
              placeholder="Search player, phone, or booking reference"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-navy placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="partner-booking-advanced-search"
            onClick={() => setShowFilters((open) => !open)}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-navy hover:bg-slate-50"
          >
            <FilterIcon />
            Advanced search
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">
                {activeFilters.length}
              </span>
            )}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className={`h-4 w-4 transition-transform ${
                showFilters ? "rotate-180" : ""
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
          id="partner-booking-advanced-search"
          className={`${
            showFilters ? "grid" : "hidden"
          } mt-3 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4`}
        >
          <Select name="hub" value={filters.hubId} label="All hubs" options={hubOptions} />
          <Select name="court" value={filters.courtId} label="All courts" options={courtOptions} />
          <Select name="status" value={filters.status} label="Any status" options={statusOptions} />
          <Select name="payment" value={filters.payment} label="Any payment" options={paymentOptions} />
          <label className="text-xs font-semibold text-slate-500">
            From date
            <input type="date" name="from" defaultValue={filters.from} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-navy" />
          </label>
          <label className="text-xs font-semibold text-slate-500">
            To date
            <input type="date" name="to" defaultValue={filters.to} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-navy" />
          </label>
          <Select name="sort" value={filters.sort} label="Sort" options={sortOptions} includeBlank={false} />
          <div className="flex items-end gap-2 lg:justify-end">
            <Link href={clearHref} className="inline-flex h-10 items-center rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50 hover:text-navy">
              Clear filters
            </Link>
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-white hover:bg-primary-hover">
              Show results
            </button>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            {activeFilters.map((filter) => (
              <span key={filter} className="rounded-full border border-primary/15 bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary">
                {filter}
              </span>
            ))}
            <Link href={clearHref} className="px-1 text-[11px] font-semibold text-slate-500 hover:text-navy">
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
          {resultCount > 0 && (
            <p className="text-xs text-slate-400">
              Showing {firstResult}–{lastResult}
            </p>
          )}
        </div>
        {resultCount > 0 ? (
          viewMode === "list" ? (
            <div className="mt-3 space-y-2">{list}</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">{grid}</div>
          )
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No bookings match these filters.
          </p>
        )}
      </section>

      {resultCount > 0 && (
        <nav className="mt-5 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-4 sm:flex-row" aria-label="Booking pages">
          <p className="text-xs text-slate-500">Page {page} of {pageCount}</p>
          <div className="flex items-center gap-2">
            <PaginationLink href={previousHref}>Previous</PaginationLink>
            <PaginationLink href={nextHref}>Next</PaginationLink>
          </div>
        </nav>
      )}
    </div>
  );
}

function ViewButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${active ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-navy"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function PeriodTab({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`border-b-2 px-1 pb-3 text-sm font-semibold transition-colors ${active ? "border-primary text-navy" : "border-transparent text-slate-500 hover:text-navy"}`}>
      {label}
      <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{count}</span>
    </Link>
  );
}

function Select({ name, value, label, options, includeBlank = true }: { name: string; value: string; label: string; options: FilterOption[]; includeBlank?: boolean }) {
  return (
    <select name={name} defaultValue={value} aria-label={label} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-navy focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 lg:w-auto lg:min-w-32">
      {includeBlank && <option value="">{label}</option>}
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function PaginationLink({ href, children }: { href: string | null; children: ReactNode }) {
  if (!href) {
    return <span aria-disabled="true" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-300">{children}</span>;
  }
  return <Link href={href} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-primary/30 hover:bg-primary-soft">{children}</Link>;
}

const statusOptions = [
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "PENDING", label: "Awaiting payment" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "EXPIRED", label: "Expired" },
];

const paymentOptions = [
  { value: "paid", label: "Paid" },
  { value: "unpaid", label: "Unpaid" },
  { value: "refunded", label: "Refunded" },
];

const sortOptions = [
  { value: "soonest", label: "Soonest first" },
  { value: "newest", label: "Newest booking" },
  { value: "player", label: "Player name" },
  { value: "amount", label: "Highest amount" },
];
