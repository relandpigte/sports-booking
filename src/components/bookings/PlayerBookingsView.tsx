"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

type BookingType = "all" | "courts" | "events";

export function PlayerBookingsView({
  upcomingCourts,
  pastCourts,
  upcomingEvents,
  pastEvents,
  upcomingCourtCount,
  pastCourtCount,
  upcomingEventCount,
  pastEventCount,
}: {
  upcomingCourts: ReactNode;
  pastCourts: ReactNode;
  upcomingEvents: ReactNode;
  pastEvents: ReactNode;
  upcomingCourtCount: number;
  pastCourtCount: number;
  upcomingEventCount: number;
  pastEventCount: number;
}) {
  const [type, setType] = useState<BookingType>("all");
  const showCourts = type === "all" || type === "courts";
  const showEvents = type === "all" || type === "events";
  const upcomingCount =
    (showCourts ? upcomingCourtCount : 0) +
    (showEvents ? upcomingEventCount : 0);
  const pastCount =
    (showCourts ? pastCourtCount : 0) + (showEvents ? pastEventCount : 0);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Your schedule"
        title="Bookings"
        description="Manage your court reservations and event registrations in one place."
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
          </div>
        }
      />

      <div
        role="tablist"
        aria-label="Booking types"
        className="mt-6 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm"
      >
        {(
          [
            ["all", "All"],
            ["courts", "Courts"],
            ["events", "Events"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={type === value}
            onClick={() => setType(value)}
            className={`min-h-9 rounded-lg px-4 text-xs font-semibold transition-colors ${
              type === value
                ? "bg-navy text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-50 hover:text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-gray-900">
          Upcoming ({upcomingCount})
        </h2>
        {upcomingCount > 0 ? (
          <div className="mt-3 space-y-5">
            {showCourts && upcomingCourtCount > 0 && (
              <BookingGroup
                title={type === "all" ? "Court bookings" : undefined}
              >
                {upcomingCourts}
              </BookingGroup>
            )}
            {showEvents && upcomingEventCount > 0 && (
              <BookingGroup
                title={type === "all" ? "Event registrations" : undefined}
              >
                {upcomingEvents}
              </BookingGroup>
            )}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">No upcoming bookings found.</p>
          </div>
        )}
      </section>

      {pastCount > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">
            History ({pastCount})
          </h2>
          <div className="mt-3 space-y-5">
            {showCourts && pastCourtCount > 0 && (
              <BookingGroup
                title={type === "all" ? "Court bookings" : undefined}
              >
                {pastCourts}
              </BookingGroup>
            )}
            {showEvents && pastEventCount > 0 && (
              <BookingGroup
                title={type === "all" ? "Event registrations" : undefined}
              >
                {pastEvents}
              </BookingGroup>
            )}
          </div>
        </section>
      )}
    </div>
  );
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
