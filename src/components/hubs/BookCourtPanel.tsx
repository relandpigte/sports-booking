"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DateStrip } from "@/components/hubs/DateStrip";
import { SlotGrid } from "@/components/hubs/SlotGrid";
import { useAvailabilityStream } from "@/hooks/useAvailabilityStream";
import { createBookingAction, type BookingFormState } from "@/lib/booking-actions";
import {
  buildSlots,
  canBook,
  clampRange,
  rangeHours,
  toggleHour,
  type HourRange,
} from "@/lib/slots";
import { formatPHP } from "@/lib/currency";
import { formatHourLabel, formatManilaDateLong } from "@/lib/time";
import { COURT_TYPE_LABELS, type OperatingHours } from "@/lib/constants";

type PanelCourt = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
};

const initialState: BookingFormState = {};

export function BookCourtPanel({
  courts,
  operatingHours,
  today,
  nowHour,
  initialAvailability,
  viewerRole,
}: {
  courts: PanelCourt[];
  operatingHours: OperatingHours | null;
  today: string;
  nowHour: number;
  initialAvailability: { courtId: string; date: string; bookedHours: number[] } | null;
  viewerRole: Role | null;
}) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [range, setRange] = useState<HourRange | null>(null);
  const [state, formAction, pending] = useActionState(
    createBookingAction,
    initialState
  );

  const { bookedHours, live } = useAvailabilityStream(
    courtId || null,
    date,
    initialAvailability
  );

  const court = courts.find((c) => c.id === courtId) ?? null;

  const { closed, slots } = useMemo(
    () =>
      buildSlots({
        operatingHours,
        date,
        bookedHours: bookedHours ?? [],
        today,
        nowHour,
      }),
    [operatingHours, date, bookedHours, today, nowHour]
  );

  // The selection is trimmed during render rather than repaired in an effect,
  // so hours someone else books out from under us drop off on the next frame
  // instead of silently staying selected.
  const selected = clampRange(slots, range);
  const selectedHours = selected ? rangeHours(selected) : 0;
  const ready =
    selected != null && canBook(slots, selected.start, selectedHours);
  const total =
    court?.hourlyRate != null ? court.hourlyRate * selectedHours : null;

  // Switching court or date invalidates the selection — reset in the handler,
  // not an effect.
  function selectCourt(id: string) {
    setCourtId(id);
    setRange(null);
  }

  function selectDate(next: string) {
    setDate(next);
    setRange(null);
  }

  // Toggle against the trimmed selection so a tap never revives an hour that
  // is no longer available.
  function toggle(hour: number) {
    setRange(toggleHour(selected, hour));
  }

  if (courts.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-base font-semibold text-gray-900">Book a court</h2>

      <form
        action={formAction}
        noValidate
        className="mt-3 flex flex-col gap-5 rounded-2xl border border-gray-200 p-5 sm:p-6"
      >
        {/* The panel keeps its state in React; these carry it into FormData. */}
        <input type="hidden" name="courtId" value={courtId} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="startHour" value={selected?.start ?? ""} />
        <input type="hidden" name="hours" value={selectedHours} />

        {state.message && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600"
          >
            {state.message}
          </p>
        )}
        {state.success && (
          <p
            role="status"
            className="rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700"
          >
            {state.success}{" "}
            <Link href="/dashboard/bookings" className="font-medium underline">
              View your bookings
            </Link>
          </p>
        )}

        {courts.length > 1 ? (
          <Select
            label="Court"
            name="court"
            value={courtId}
            onChange={(e) => selectCourt(e.target.value)}
            options={courts.map((c) => ({
              value: c.id,
              label: `${c.name} — ${COURT_TYPE_LABELS[c.courtType] ?? c.courtType}${
                c.hourlyRate != null ? ` · ${formatPHP(c.hourlyRate)}/hr` : ""
              }`,
            }))}
          />
        ) : (
          court && (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{court.name}</span>
              {court.hourlyRate != null
                ? ` · ${formatPHP(court.hourlyRate)}/hr`
                : " · Rate on request"}
            </p>
          )
        )}

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-800">Date</span>
          <DateStrip today={today} value={date} onChange={selectDate} />
          {state.errors?.date && (
            <p className="text-xs text-red-500">{state.errors.date}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-gray-800">Time</span>
            <span className="text-xs text-gray-400">
              Tap hours to build your session
            </span>
          </div>
          {closed ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
              Closed on {formatManilaDateLong(date)}.
            </p>
          ) : (
            <SlotGrid
              slots={slots}
              range={selected}
              onToggle={toggle}
              loading={bookedHours == null}
              live={live}
            />
          )}
          {state.errors?.startHour && (
            <p className="text-xs text-red-500">{state.errors.startHour}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
          {selected != null && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-500">
                {formatManilaDateLong(date)} ·{" "}
                {formatHourLabel(selected.start)} –{" "}
                {formatHourLabel(selected.end + 1)} ({selectedHours}
                {selectedHours === 1 ? " hr" : " hrs"})
              </span>
              <span className="shrink-0 text-base font-semibold text-gray-900">
                {total != null ? formatPHP(total) : "Rate on request"}
              </span>
            </div>
          )}

          {viewerRole === null ? (
            <Link
              href="/login"
              className="rounded-lg bg-primary px-4 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Sign in to book
            </Link>
          ) : viewerRole !== "PLAYER" ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
              Bookings are for player accounts.
            </p>
          ) : (
            <Button type="submit" disabled={!ready || pending}>
              {pending
                ? "Booking…"
                : selected == null
                  ? "Pick your hours"
                  : `Book ${selectedHours} ${selectedHours === 1 ? "hour" : "hours"}`}
            </Button>
          )}

          <p className="text-xs text-gray-400">
            No payment needed — confirm here and settle at the venue.
          </p>
        </div>
      </form>
    </section>
  );
}
