"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/Button";
import { DateStrip } from "@/components/hubs/DateStrip";
import {
  CourtAvailabilityBrowser,
  type CourtAvailabilityView,
} from "@/components/hubs/CourtAvailabilityBrowser";
import {
  useHubAvailabilityStream,
  type HubAvailabilitySnapshot,
} from "@/hooks/useHubAvailabilityStream";
import { createBookingAction, type BookingFormState } from "@/lib/booking-actions";
import {
  buildSlots,
  clampSelection,
  runHours,
  slotTotal,
  toRuns,
  toggleHourIn,
} from "@/lib/slots";
import type { CourtScheduleRule } from "@/lib/slots";
import { formatPHP } from "@/lib/currency";
import { formatHourLabel, formatManilaDateLong } from "@/lib/time";
import {
  BOOKING_HOLD_MINUTES,
  bookingServiceFeeFor,
  grossFor,
  type OperatingHours,
} from "@/lib/constants";

type PanelCourt = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
  scheduleRules: CourtScheduleRule[];
};

const initialState: BookingFormState = {};

export function BookCourtPanel({
  hubId,
  courts,
  operatingHours,
  today,
  nowHour,
  initialAvailability,
  viewerRole,
  paymentRequired,
}: {
  hubId: string;
  courts: PanelCourt[];
  operatingHours: OperatingHours | null;
  today: string;
  nowHour: number;
  initialAvailability: HubAvailabilitySnapshot | null;
  viewerRole: Role | null;
  // This venue has connected a gateway, so booking holds the hours rather than
  // confirming them. False for every venue that hasn't — and then every word
  // below is exactly what it was before payments existed.
  paymentRequired: boolean;
}) {
  const [activeCourtId, setActiveCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [pickedByCourt, setPickedByCourt] = useState<Record<string, number[]>>(
    {}
  );
  const [view, setView] = useState<CourtAvailabilityView>("grid");
  const [state, formAction, pending] = useActionState(
    createBookingAction,
    initialState
  );

  const { occupancies, live } = useHubAvailabilityStream(
    hubId,
    date,
    initialAvailability
  );

  const courtAvailability = useMemo(
    () =>
      courts.map((item) => {
        const occupancy = occupancies?.get(item.id);
        const availability = buildSlots({
          operatingHours,
          date,
          bookedHours: occupancy?.bookedHours ?? [],
          openPlayHours: occupancy?.openPlayHours ?? [],
          today,
          nowHour,
          courtHourlyRate: item.hourlyRate,
          scheduleRules: item.scheduleRules,
        });
        return { ...item, ...availability };
      }),
    [courts, occupancies, operatingHours, date, today, nowHour]
  );
  const closed = courtAvailability.every((item) => item.closed);

  // Trim each court independently during render. If a live update takes an
  // hour, it drops out of the submitted cart without disturbing other courts.
  const selectedGroups = useMemo(
    () =>
      courtAvailability
        .map((item) => {
          const hours = clampSelection(
            item.slots,
            pickedByCourt[item.id] ?? []
          );
          return {
            court: item,
            hours,
            runs: toRuns(hours),
            total: slotTotal(item.slots, hours),
          };
        })
        .filter((group) => group.hours.length > 0),
    [courtAvailability, pickedByCourt]
  );
  const selectedByCourt = useMemo(
    () =>
      Object.fromEntries(
        selectedGroups.map((group) => [group.court.id, group.hours])
      ),
    [selectedGroups]
  );
  const selectedCount = selectedGroups.reduce(
    (sum, group) => sum + group.hours.length,
    0
  );
  const pricedTotal = selectedGroups.reduce(
    (sum, group) => sum + (group.total ?? 0),
    0
  );
  const hasUnpricedSelection = selectedGroups.some(
    (group) => group.total == null
  );
  const requiresOnlinePayment = paymentRequired && pricedTotal > 0;

  // Court headers only focus a column/list. They never clear another court's
  // hours: the comparison view is also a multi-court cart.
  function selectCourt(id: string) {
    setActiveCourtId(id);
  }

  function selectDate(next: string) {
    setDate(next);
    setPickedByCourt({});
  }

  // Toggle against that court's trimmed selection so a tap never revives an
  // hour that the live stream has made unavailable.
  function toggle(nextCourtId: string, hour: number) {
    const next = courtAvailability.find((item) => item.id === nextCourtId);
    if (!next?.slots.some((slot) => slot.hour === hour && slot.available)) {
      return;
    }
    setActiveCourtId(nextCourtId);
    setPickedByCourt((current) => {
      const selected = clampSelection(next.slots, current[nextCourtId] ?? []);
      const updated = toggleHourIn(selected, hour);
      const result = { ...current };
      if (updated.length > 0) result[nextCourtId] = updated;
      else delete result[nextCourtId];
      return result;
    });
  }

  if (courts.length === 0) return null;

  return (
    <section
      id="booking"
      className="scroll-mt-24 border-y border-gray-200 bg-white py-14 sm:py-16"
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Live availability
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
            Book a court
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-gray-500 sm:text-base">
            Browse every court, compare live availability, and pick the hours
            that work for you.
          </p>
        </div>

        <form
          action={formAction}
          noValidate
          className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10"
        >
          {/* The panel keeps its state in React; these carry it into FormData. */}
          <input type="hidden" name="date" value={date} />
          {selectedGroups.flatMap((group) =>
            group.hours.map((hour) => (
              <span key={`${group.court.id}:${hour}`}>
                <input
                  type="hidden"
                  name="courtIds"
                  value={group.court.id}
                />
                <input type="hidden" name="hours" value={hour} />
              </span>
            ))
          )}

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
              <span className="mb-3 block text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                Select date
              </span>
              <DateStrip today={today} value={date} onChange={selectDate} />
              {state.errors?.date && (
                <p className="mt-2 text-xs text-red-500">{state.errors.date}</p>
              )}
            </div>

            <div>
              {closed && occupancies != null ? (
                <p className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-6 text-sm text-gray-500">
                  All courts are closed on {formatManilaDateLong(date)}.
                </p>
              ) : (
                <CourtAvailabilityBrowser
                  courts={courtAvailability}
                  activeCourtId={activeCourtId}
                  selectedByCourt={selectedByCourt}
                  view={view}
                  onViewChange={setView}
                  onSelectCourt={selectCourt}
                  onToggle={toggle}
                  loading={occupancies == null}
                  live={live}
                />
              )}
              {(state.errors?.hours || state.errors?.selections) && (
                <p className="mt-2 text-xs text-red-500">
                  {state.errors.hours ?? state.errors.selections}
                </p>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-2xl border border-navy/10 bg-navy-soft p-6 sm:p-8 lg:sticky lg:top-24">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-navy/45">
              Booking summary
            </p>

            {selectedGroups.length > 0 ? (
              <div className="mt-6 flex flex-col gap-3 text-sm">
                <p className="font-semibold text-navy">
                  {formatManilaDateLong(date)}
                </p>
                {selectedGroups.map((group) => (
                  <div
                    key={group.court.id}
                    className="rounded-xl bg-white/55 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-extrabold text-navy">
                        {group.court.name}
                      </p>
                      <p className="text-xs font-bold text-navy/65">
                        {group.total != null
                          ? formatPHP(group.total)
                          : "Rate on request"}
                      </p>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {group.runs.map((run) => (
                        <div
                          key={run.start}
                          className="flex items-center justify-between gap-3"
                        >
                          <span className="text-xs text-navy/70">
                            {formatHourLabel(run.start)} –{" "}
                            {formatHourLabel(run.end + 1)}
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-navy">
                            {runHours(run)} {runHours(run) === 1 ? "hr" : "hrs"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="mt-2 space-y-2 border-t border-navy/10 pt-4">
                  <div className="flex items-center justify-between gap-3 text-navy/65">
                    <span>
                      Court total ({selectedCount}{" "}
                      {selectedCount === 1 ? "court-hour" : "court-hours"})
                    </span>
                    <span className="shrink-0 font-semibold text-navy">
                      {formatPHP(pricedTotal)}
                    </span>
                  </div>
                  {hasUnpricedSelection && (
                    <p className="text-[11px] leading-relaxed text-navy/50">
                      A selected court has no online rate and will be confirmed
                      with the venue.
                    </p>
                  )}
                  {requiresOnlinePayment && (
                    <div className="flex items-center justify-between gap-3 text-navy/65">
                      <span>Service fee (3%)</span>
                      <span className="shrink-0 font-semibold text-navy">
                        {formatPHP(bookingServiceFeeFor(pricedTotal))}
                      </span>
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-3 border-t border-navy/10 pt-4">
                    <span className="font-bold text-navy">
                      {requiresOnlinePayment ? "Booking subtotal" : "Total"}
                    </span>
                    <span className="shrink-0 text-2xl font-extrabold text-navy">
                      {formatPHP(
                        requiresOnlinePayment
                          ? grossFor(pricedTotal)
                          : pricedTotal
                      )}
                    </span>
                  </div>
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
                  disabled={selectedCount === 0 || pending}
                >
                  {pending
                    ? requiresOnlinePayment
                      ? "Holding…"
                      : "Booking…"
                    : selectedCount === 0
                      ? "Pick your hours"
                      : requiresOnlinePayment
                        ? `Hold ${selectedCount} ${selectedCount === 1 ? "court-hour" : "court-hours"}`
                        : `Book ${selectedCount} ${selectedCount === 1 ? "court-hour" : "court-hours"}`}
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
                  {requiresOnlinePayment
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
