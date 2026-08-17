"use client";

import { useId, useState } from "react";
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
    description: "Reservations, receipts, rescheduling, refunds, and court blocks.",
  },
  events: {
    name: "Events",
    description: "Open play, registrations, attendees, payments, and refunds.",
  },
  reports: {
    name: "Reports",
    description: "Revenue and booking performance. Reports stay read-only.",
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

const accessLevels: StaffAccessLevel[] = ["NONE", "VIEW", "MANAGE"];

const accessLabels: Record<StaffAccessLevel, string> = {
  NONE: "None",
  VIEW: "View",
  MANAGE: "Manage",
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
  const idPrefix = useId();
  const [permissions, setPermissions] = useState<StaffPermissions>(defaults);

  return (
    <div>
      <div
        role="table"
        aria-label="Staff module permissions"
        className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <div
          role="row"
          className="grid grid-cols-[minmax(0,1fr)_44px_44px_44px] items-center gap-1 border-b border-slate-200 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_76px_76px_76px] sm:px-5"
        >
          <span role="columnheader" className="text-xs font-black text-navy">
            Module
          </span>
          {accessLevels.map((level) => (
            <span
              key={level}
              role="columnheader"
              className="text-center text-[9px] font-black uppercase text-slate-400 sm:text-xs sm:tracking-[0.12em]"
            >
              {accessLabels[level]}
            </span>
          ))}
        </div>

        <div role="rowgroup" className="divide-y divide-slate-100">
          {STAFF_MODULES.map((module) => {
            const selected = permissions[module];
            return (
              <fieldset
                key={module}
                role="row"
                className={`grid min-w-0 grid-cols-[minmax(0,1fr)_44px_44px_44px] items-center gap-1 px-2 py-3 transition-colors sm:grid-cols-[minmax(0,1fr)_76px_76px_76px] sm:px-5 sm:py-4 ${
                  selected === "MANAGE" ? "bg-primary-soft/70" : "bg-white"
                }`}
              >
                <legend className="sr-only">{labels[module].name} access</legend>
                <div role="rowheader" className="min-w-0 pr-2">
                  <p
                    className={`text-xs font-extrabold sm:text-sm ${
                      selected === "MANAGE" ? "text-primary" : "text-navy"
                    }`}
                  >
                    {labels[module].name}
                  </p>
                  <p className="mt-0.5 hidden text-[11px] leading-4 text-slate-500 sm:block">
                    {labels[module].description}
                  </p>
                  {errors?.[module] && (
                    <p className="mt-1 text-xs font-semibold text-red-600">
                      {errors[module]}
                    </p>
                  )}
                </div>

                {accessLevels.map((level) => {
                  const disabled = module === "reports" && level === "MANAGE";
                  const checked = selected === level;
                  const inputId = `${idPrefix}-${module}-${level}`;
                  return (
                    <div key={level} role="cell" className="flex justify-center">
                      <label
                        htmlFor={inputId}
                        aria-label={`${labels[module].name}: ${accessLabels[level]}`}
                        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
                          disabled
                            ? "cursor-not-allowed"
                            : "cursor-pointer hover:bg-primary-soft"
                        }`}
                      >
                        <input
                          id={inputId}
                          type="radio"
                          name={module}
                          value={level}
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            setPermissions((current) => ({
                              ...current,
                              [module]: level,
                            }))
                          }
                          className="sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`relative flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${
                            disabled
                              ? "border-slate-200 bg-slate-200/80"
                              : checked
                                ? "border-primary bg-primary shadow-[0_0_0_3px_rgba(22,128,60,0.12)]"
                                : "border-slate-300 bg-white"
                          }`}
                        >
                          {checked && !disabled && (
                            <span className="h-2 w-2 rounded-full bg-white" />
                          )}
                          {disabled && <LockIcon />}
                        </span>
                      </label>
                    </div>
                  );
                })}
              </fieldset>
            );
          })}
        </div>

        {errors?.permissions && (
          <p className="border-t border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
            {errors.permissions}
          </p>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-ocean/20 bg-ocean-soft px-3 py-2.5 text-xs leading-5 text-ocean sm:px-4">
        <MessageIcon />
        <p>
          <span className="font-bold">Messages View</span> can read conversations.
          <span className="font-bold"> Messages Manage</span> can also reply to
          players and event participants.
        </p>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-400"
      aria-hidden="true"
    >
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}
