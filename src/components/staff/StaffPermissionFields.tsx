"use client";

import type { StaffAccessLevel } from "@prisma/client";

import {
  STAFF_MODULES,
  type StaffModule,
  type StaffPermissions,
} from "@/lib/staffing-shared";

const labels: Record<StaffModule, { name: string; description: string }> = {
  hubs: {
    name: "Hubs",
    description: "Venue details, courts, rates, hours, and schedule rules.",
  },
  bookings: {
    name: "Bookings",
    description: "Reservations, refunds, receipts, rescheduling, and court blocks.",
  },
  events: {
    name: "Events",
    description: "Open play, registrations, attendees, payments, and refunds.",
  },
  reports: {
    name: "Reports",
    description: "Revenue and booking performance. Reports are always read-only.",
  },
  messages: {
    name: "Messages",
    description: "Venue-player and event conversations.",
  },
  payments: {
    name: "Payments",
    description: "Checkout mode, PayMongo, and manual payment destinations.",
  },
};

const defaultPermissions: StaffPermissions = {
  hubs: "NONE",
  bookings: "MANAGE",
  events: "MANAGE",
  reports: "NONE",
  messages: "MANAGE",
  payments: "NONE",
};

export function StaffPermissionFields({
  defaults = defaultPermissions,
  errors,
}: {
  defaults?: StaffPermissions;
  errors?: Record<string, string>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200">
      {STAFF_MODULES.map((module) => {
        const options: StaffAccessLevel[] =
          module === "reports"
            ? ["NONE", "VIEW"]
            : ["NONE", "VIEW", "MANAGE"];
        return (
          <div
            key={module}
            className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 sm:grid-cols-[1fr_150px] sm:items-center"
          >
            <div>
              <p className="text-sm font-bold text-navy">
                {labels[module].name}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-slate-500">
                {labels[module].description}
              </p>
              {errors?.[module] && (
                <p className="mt-1 text-xs text-red-600">{errors[module]}</p>
              )}
            </div>
            <select
              name={module}
              defaultValue={defaults[module]}
              aria-label={`${labels[module].name} access`}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-navy focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {options.map((level) => (
                <option key={level} value={level}>
                  {level === "NONE"
                    ? "No access"
                    : level === "VIEW"
                      ? "View only"
                      : "Manage"}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      {errors?.permissions && (
        <p className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errors.permissions}
        </p>
      )}
    </div>
  );
}
