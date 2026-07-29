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
  clampSelection,
  runHours,
  toRuns,
  toggleHourIn,
} from "@/lib/slots";
import { formatPHP } from "@/lib/currency";
import { formatHourLabel, formatManilaDateLong } from "@/lib/time";
import {
  BOOKING_HOLD_MINUTES,
  COURT_TYPE_LABELS,
  type OperatingHours,
} from "@/lib/constants";

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
  paymentRequired,
}: {
  courts: PanelCourt[];
  operatingHours: OperatingHours | null;
  today: string;
  nowHour: number;
  initialAvailability: { courtId: string; date: string; bookedHours: number[] } | null;
  viewerRole: Role | null;
  // This venue has connected a gateway, so booking holds the hours rather than
  // confirming them. False for every venue that hasn't — and then every word
  // below is exactly what it was before payments existed.
  paymentRequired: boolean;
}) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [picked, setPicked] = useState<number[]>([]);
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
  const selected = useMemo(
    () => clampSelection(slots, picked),
    [slots, picked]
  );
  // Hours needn't be contiguous; each unbroken run becomes its own booking.
  const runs = useMemo(() => toRuns(selected), [selected]);
  const total =
    court?.hourlyRate != null ? court.hourlyRate * selected.length : null;

  // Switching court or date invalidates the selection — reset in the handler,
  // not an effect.
  function selectCourt(id: string) {
    setCourtId(id);
    setPicked([]);
  }

  function selectDate(next: string) {
    setDate(next);
    setPicked([]);
  }

  // Toggle against the trimmed selection so a tap never revives an hour that
  // is no longer available.
  function toggle(hour: number) {
    setPicked(toggleHourIn(selected, hour));
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
        {selected.map((hour) => (
          <input key={hour} type="hidden" name="hours" value={hour} />
        ))}

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
              Tap any hours you want — they don&apos;t have to be back to back
            </span>
          </div>
          {closed ? (
            <p className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-500">
              Closed on {formatManilaDateLong(date)}.
            </p>
          ) : (
            <SlotGrid
              slots={slots}
              selected={selected}
              onToggle={toggle}
              loading={bookedHours == null}
              live={live}
            />
          )}
          {state.errors?.hours && (
            <p className="text-xs text-red-500">{state.errors.hours}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-4">
          {runs.length > 0 && (
            <div className="flex flex-col gap-1.5 text-sm">
              <p className="text-gray-500">{formatManilaDateLong(date)}</p>
              {/* A gap between hours means separate sessions, so list each one
                  — they're booked (and cancelled) individually. */}
              {runs.map((run) => (
                <div
                  key={run.start}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-gray-700">
                    {formatHourLabel(run.start)} –{" "}
                    {formatHourLabel(run.end + 1)}
                  </span>
                  <span className="shrink-0 text-gray-500">
                    {runHours(run)} {runHours(run) === 1 ? "hr" : "hrs"}
                  </span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between gap-3 border-t border-gray-100 pt-2">
                <span className="text-gray-500">
                  {selected.length} {selected.length === 1 ? "hour" : "hours"}
                  {runs.length > 1 ? ` · ${runs.length} sessions` : ""}
                </span>
                <span className="shrink-0 text-base font-semibold text-gray-900">
                  {total != null ? formatPHP(total) : "Rate on request"}
                </span>
              </div>
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
            <Button type="submit" disabled={selected.length === 0 || pending}>
              {pending
                ? paymentRequired
                  ? "Holding…"
                  : "Booking…"
                : selected.length === 0
                  ? "Pick your hours"
                  : paymentRequired
                    ? `Hold ${selected.length} ${selected.length === 1 ? "hour" : "hours"}`
                    : `Book ${selected.length} ${selected.length === 1 ? "hour" : "hours"}`}
            </Button>
          )}

          <p className="text-xs text-gray-400">
            {paymentRequired
              ? `This venue takes payment online. We'll hold your hours for ${BOOKING_HOLD_MINUTES} minutes while you pay.`
              : "No payment needed — confirm here and settle at the venue."}
          </p>
        </div>
      </form>
    </section>
  );
}
