"use client";

import { useState, type ReactNode } from "react";

import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";

type ViewMode = "list" | "grid";

function ListIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
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
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
      <path
        d="M3.5 3.5h5v5h-5zM11.5 3.5h5v5h-5zM3.5 11.5h5v5h-5zM11.5 11.5h5v5h-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EmptyUpcoming() {
  return (
    <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
      No upcoming bookings yet.
    </p>
  );
}

export function PartnerBookingsView({
  upcomingCount,
  historyCount,
  upcomingList,
  upcomingGrid,
  historyList,
  historyGrid,
}: {
  upcomingCount: number;
  historyCount: number;
  upcomingList: ReactNode;
  upcomingGrid: ReactNode;
  historyList: ReactNode;
  historyGrid: ReactNode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  const viewToggle = (
    <div
      role="group"
      aria-label="Booking view"
      className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1 shadow-sm shadow-navy/5"
    >
      <button
        type="button"
        aria-pressed={viewMode === "list"}
        onClick={() => setViewMode("list")}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
          viewMode === "list"
            ? "bg-white text-navy shadow-sm"
            : "text-gray-500 hover:text-navy"
        }`}
      >
        <ListIcon />
        List
      </button>
      <button
        type="button"
        aria-pressed={viewMode === "grid"}
        onClick={() => setViewMode("grid")}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
          viewMode === "grid"
            ? "bg-white text-navy shadow-sm"
            : "text-gray-500 hover:text-navy"
        }`}
      >
        <GridIcon />
        Grid
      </button>
    </div>
  );

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Venue operations"
        title="Bookings"
        description="Manage player reservations across all of your hubs."
        actions={viewToggle}
      />

      <section className="mt-6">
        <h2 className="text-base font-semibold text-gray-900">
          Upcoming ({upcomingCount})
        </h2>
        {upcomingCount > 0 ? (
          viewMode === "list" ? (
            <div className="mt-3 space-y-2">{upcomingList}</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {upcomingGrid}
            </div>
          )
        ) : (
          <EmptyUpcoming />
        )}
      </section>

      {historyCount > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">
            History ({historyCount})
          </h2>
          {viewMode === "list" ? (
            <div className="mt-3 space-y-2">{historyList}</div>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {historyGrid}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
