"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/Button";
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
  bookingServiceFeeFor,
  grossFor,
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
    <section
      id="booking"
      className="scroll-mt-24 border-y border-gray-200 bg-white py-14 sm:py-16"
    >
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Live availability
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
            Book a court
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-500 sm:text-base">
            Choose a court, date, and any available hours that work for you.
          </p>
        </div>

        <form
          action={formAction}
          noValidate
          className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)] lg:gap-10"
        >
          {/* The panel keeps its state in React; these carry it into FormData. */}
          <input type="hidden" name="courtId" value={courtId} />
          <input type="hidden" name="date" value={date} />
          {selected.map((hour) => (
            <input key={hour} type="hidden" name="hours" value={hour} />
          ))}

          {(state.message || state.success) && (
            <div className="lg:col-span-2">
              {state.message && (
                <p
                  role="alert"
                  className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600"
                >
                  {state.message}
                </p>
              )}
              {state.success && (
                <p
                  role="status"
                  className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700"
                >
                  {state.success}{" "}
                  <Link
                    href="/dashboard/bookings"
                    className="font-semibold underline"
                  >
                    View your bookings
                  </Link>
                </p>
              )}
            </div>
          )}

          <div className="space-y-8">
            <div>
              <label
                htmlFor="booking-court"
                className="mb-3 block text-xs font-bold uppercase tracking-[0.16em] text-gray-400"
              >
                Choose court
              </label>
              {courts.length > 1 ? (
                <div className="relative">
                  <select
                    id="booking-court"
                    value={courtId}
                    onChange={(event) => selectCourt(event.target.value)}
                    className="min-h-14 w-full appearance-none rounded-xl border border-gray-200 bg-[#f7faf8] px-4 py-3 pr-11 text-sm font-semibold text-navy transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {courts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} —{" "}
                        {COURT_TYPE_LABELS[item.courtType] ?? item.courtType}
                        {item.hourlyRate != null
                          ? ` · ${formatPHP(item.hourlyRate)}/hr`
                          : ""}
                      </option>
                    ))}
                  </select>
                  <svg
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              ) : (
                court && (
                  <div className="rounded-xl border border-gray-200 bg-[#f7faf8] px-4 py-3.5 text-sm text-gray-600">
                    <span className="font-semibold text-navy">{court.name}</span>
                    {court.hourlyRate != null
                      ? ` · ${formatPHP(court.hourlyRate)}/hr`
                      : " · Rate on request"}
                  </div>
                )
              )}
            </div>

            <div>
              <span className="mb-3 block text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                Select date
              </span>
              <DateStrip today={today} value={date} onChange={selectDate} />
              {state.errors?.date && (
                <p className="mt-2 text-xs text-red-500">{state.errors.date}</p>
              )}
            </div>

            <div>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                  Available hours
                </span>
                <span className="text-xs text-gray-400">
                  Pick any hours — they needn&apos;t be consecutive
                </span>
              </div>
              {closed ? (
                <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm text-gray-500">
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
                <p className="mt-2 text-xs text-red-500">
                  {state.errors.hours}
                </p>
              )}
            </div>
          </div>

          <aside className="rounded-2xl border border-navy/10 bg-navy-soft p-6 sm:p-8 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-navy/45">
              Booking summary
            </p>

            {runs.length > 0 ? (
              <div className="mt-6 flex flex-col gap-3 text-sm">
                <p className="font-semibold text-navy">
                  {formatManilaDateLong(date)}
                </p>
                {/* Gaps create separate bookings, so show every run. */}
                {runs.map((run) => (
                  <div
                    key={run.start}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-navy/70">
                      {formatHourLabel(run.start)} –{" "}
                      {formatHourLabel(run.end + 1)}
                    </span>
                    <span className="shrink-0 font-semibold text-navy">
                      {runHours(run)} {runHours(run) === 1 ? "hr" : "hrs"}
                    </span>
                  </div>
                ))}

                <div className="mt-2 space-y-2 border-t border-navy/10 pt-4">
                  <div className="flex items-center justify-between gap-3 text-navy/65">
                    <span>
                      Court rate ({selected.length}{" "}
                      {selected.length === 1 ? "hour" : "hours"})
                    </span>
                    <span className="shrink-0 font-semibold text-navy">
                      {total != null ? formatPHP(total) : "Rate on request"}
                    </span>
                  </div>
                  {paymentRequired && total != null && total > 0 && (
                    <div className="flex items-center justify-between gap-3 text-navy/65">
                      <span>Service fee (3%)</span>
                      <span className="shrink-0 font-semibold text-navy">
                        {formatPHP(bookingServiceFeeFor(total))}
                      </span>
                    </div>
                  )}
                  {total != null && (
                    <div className="flex items-end justify-between gap-3 border-t border-navy/10 pt-4">
                      <span className="font-bold text-navy">
                        {paymentRequired ? "Booking subtotal" : "Total"}
                      </span>
                      <span className="shrink-0 text-2xl font-extrabold text-navy">
                        {formatPHP(
                          paymentRequired ? grossFor(total) : total
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-xl border border-dashed border-navy/15 bg-white/45 px-4 py-5">
                <p className="text-sm font-medium text-navy">
                  Your selected hours will appear here.
                </p>
                <p className="mt-1 text-xs leading-relaxed text-navy/55">
                  Choose one or more available hours to see the booking total.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-4">
              {viewerRole === null ? (
                <Link
                  href="/login"
                  className="flex min-h-12 items-center justify-center rounded-xl bg-primary px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-primary-hover"
                >
                  Sign in to book
                </Link>
              ) : viewerRole !== "PLAYER" ? (
                <p className="rounded-xl bg-white/60 px-4 py-3 text-sm text-navy/65">
                  Bookings are for player accounts.
                </p>
              ) : (
                <Button
                  type="submit"
                  className="min-h-12 rounded-xl"
                  disabled={selected.length === 0 || pending}
                >
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

              <div className="flex items-start gap-3 border-t border-navy/10 pt-4">
                <svg
                  className="mt-0.5 shrink-0 text-ocean"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-[11px] leading-relaxed text-navy/55">
                  {paymentRequired
                    ? `This venue takes payment online. We'll hold your hours for ${BOOKING_HOLD_MINUTES} minutes while you pay. PayMongo adds its processing fee after you choose a payment method.`
                    : "No payment needed — confirm here and settle at the venue."}
                </p>
              </div>
            </div>
          </aside>
        </form>
      </div>
    </section>
  );
}
