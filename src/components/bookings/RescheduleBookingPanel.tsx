"use client";

import { useActionState, useMemo, useState } from "react";

import {
  CourtAvailabilityBrowser,
  type CourtAvailabilityView,
} from "@/components/hubs/CourtAvailabilityBrowser";
import { DateStrip } from "@/components/hubs/DateStrip";
import { usePwa } from "@/components/pwa/PwaProvider";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useHubAvailabilityStream } from "@/hooks/useHubAvailabilityStream";
import {
  rescheduleHubBookingAction,
  type BookingFormState,
} from "@/lib/booking-actions";
import { type OperatingHours } from "@/lib/constants";
import { formatPHP } from "@/lib/currency";
import {
  buildSlots,
  clampSelection,
  runHours,
  slotTotal,
  toRuns,
  toggleHourIn,
  type CourtScheduleRule,
} from "@/lib/slots";
import {
  formatHourLabel,
  formatManilaDateLong,
  formatSlotRange,
} from "@/lib/time";

type PanelCourt = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
  scheduleRules: CourtScheduleRule[];
};

const initialState: BookingFormState = {};

// Moves an existing booking through the same all-court availability browser
// used while creating a booking. A move still targets one court and keeps the
// original duration; the Server Action rechecks both rules before writing.
export function RescheduleBookingPanel({
  bookingId,
  hubId,
  courts,
  operatingHours,
  today,
  nowHour,
  current,
  onDone,
}: {
  bookingId: string;
  hubId: string;
  courts: PanelCourt[];
  operatingHours: OperatingHours | null;
  today: string;
  nowHour: number;
  current: {
    courtId: string;
    courtName: string;
    date: string;
    startHour: number;
    endHour: number;
    totalPrice: number | null;
  };
  onDone: () => void;
}) {
  const [courtId, setCourtId] = useState(current.courtId);
  const [date, setDate] = useState(current.date);
  const [picked, setPicked] = useState<number[]>(
    Array.from(
      { length: current.endHour - current.startHour },
      (_, index) => current.startHour + index
    )
  );
  const [reason, setReason] = useState("");
  const [view, setView] = useState<CourtAvailabilityView>("list");
  // The current hours are only a starting point. The first slot tap replaces
  // them, which keeps a partner from accidentally doubling the duration.
  const [touched, setTouched] = useState(false);
  const [state, formAction, pending] = useActionState(
    rescheduleHubBookingAction,
    initialState
  );
  const { isOnline } = usePwa();

  const { occupancies, live } = useHubAvailabilityStream(
    hubId,
    date,
    null,
    bookingId
  );

  const courtAvailability = useMemo(
    () =>
      courts.map((court) => {
        const occupancy = occupancies?.get(court.id);
        const { slots } = buildSlots({
          operatingHours,
          date,
          bookedHours: occupancy?.bookedHours ?? [],
          openPlayHours: occupancy?.openPlayHours ?? [],
          dateBlocks: occupancy?.dateBlocks ?? [],
          today,
          nowHour,
          courtHourlyRate: court.hourlyRate,
          scheduleRules: court.scheduleRules,
        });
        return {
          id: court.id,
          name: court.name,
          courtType: court.courtType,
          slots,
        };
      }),
    [courts, occupancies, operatingHours, date, today, nowHour]
  );

  const court = courts.find((item) => item.id === courtId) ?? null;
  const activeSlots = useMemo(
    () =>
      courtAvailability.find((item) => item.id === courtId)?.slots ?? [],
    [courtAvailability, courtId]
  );
  // Hours taken while the modal is open disappear from the selection as soon
  // as the next live snapshot arrives.
  const selected = useMemo(
    () => clampSelection(activeSlots, picked),
    [activeSlots, picked]
  );
  const selectedByCourt = useMemo(
    () => (selected.length > 0 ? { [courtId]: selected } : {}),
    [courtId, selected]
  );
  const runs = useMemo(() => toRuns(selected), [selected]);
  const selectedHours = selected.length;
  const total = slotTotal(activeSlots, selected);

  const unchanged =
    runs.length === 1 &&
    courtId === current.courtId &&
    date === current.date &&
    runs[0].start === current.startHour &&
    runs[0].end + 1 === current.endHour;

  const currentHours = current.endHour - current.startHour;
  const hoursLabel = `${currentHours} ${currentHours === 1 ? "hour" : "hours"}`;
  const wrongLength = selectedHours > 0 && selectedHours !== currentHours;
  const blockedReason =
    selectedHours === 0
      ? `Pick ${hoursLabel} for the new time.`
      : wrongLength
        ? `${selectedHours} of ${currentHours} hours selected. Pick exactly ${hoursLabel} to keep the booking duration.`
        : unchanged
          ? "Pick a different court, date or time."
          : null;

  function selectCourt(nextCourtId: string) {
    if (nextCourtId === courtId) return;
    setCourtId(nextCourtId);
    setPicked([]);
    setTouched(true);
  }

  function selectDate(nextDate: string) {
    setDate(nextDate);
    setPicked([]);
    setTouched(true);
  }

  function clearHours() {
    setPicked([]);
    setTouched(true);
  }

  function toggle(nextCourtId: string, hour: number) {
    const nextSlot = courtAvailability
      .find((item) => item.id === nextCourtId)
      ?.slots.find((slot) => slot.hour === hour);
    if (!nextSlot?.available) return;

    if (!touched || nextCourtId !== courtId) {
      setCourtId(nextCourtId);
      setPicked([hour]);
      setTouched(true);
      return;
    }
    setPicked(toggleHourIn(selected, hour));
  }

  if (state.success) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-2xl text-green-600">
          ✓
        </span>
        <p role="status" className="mt-4 font-semibold text-navy">
          {state.success}
        </p>
        <p className="mt-1 text-sm text-gray-500">
          The player can now see the updated court and time.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="mt-5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="id" value={bookingId} />
      <input type="hidden" name="courtId" value={courtId} />
      <input type="hidden" name="date" value={date} />
      {selected.map((hour) => (
        <input key={hour} type="hidden" name="hours" value={hour} />
      ))}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
        <section
          aria-label="Current booking"
          className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3.5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
                Current booking
              </p>
              <p className="mt-1 text-base font-extrabold text-navy">
                {current.courtName}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-700 sm:justify-end">
              <span>{formatManilaDateLong(current.date)}</span>
              <span className="font-semibold text-navy">
                {formatSlotRange(current.startHour, current.endHour)}
              </span>
              <span>
                {current.totalPrice != null
                  ? formatPHP(current.totalPrice)
                  : "Rate on request"}
              </span>
            </div>
          </div>
        </section>

        {state.message && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {state.message}
          </p>
        )}

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                  1. Choose a new date
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Availability updates automatically for every court.
                </p>
              </div>
              <DateStrip today={today} value={date} onChange={selectDate} />
              {state.errors?.date && (
                <p className="text-xs text-red-500">{state.errors.date}</p>
              )}
            </div>

            <div className="mt-6">
              <CourtAvailabilityBrowser
                courts={courtAvailability}
                activeCourtId={courtId}
                selectedByCourt={selectedByCourt}
                view={view}
                onViewChange={setView}
                onSelectCourt={selectCourt}
                onToggle={toggle}
                loading={occupancies == null}
                live={live}
                selectionHint={`Pick exactly ${hoursLabel} on one court. Choosing another court replaces this selection.`}
              />
              {(state.errors?.courtId || state.errors?.hours) && (
                <div className="mt-3 space-y-1 text-xs text-red-500">
                  {state.errors.courtId && <p>{state.errors.courtId}</p>}
                  {state.errors.hours && <p>{state.errors.hours}</p>}
                </div>
              )}
            </div>
          </div>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50/70 p-4 sm:p-5 lg:sticky lg:top-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
                  Review the move
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  The booking stays {hoursLabel} long.
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                  selectedHours === currentHours
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {selectedHours} / {currentHours} hrs
              </span>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-gray-400">
                  From
                </p>
                <p className="mt-1 font-semibold text-gray-500 line-through decoration-gray-300">
                  {current.courtName}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {formatManilaDateLong(current.date)} ·{" "}
                  {formatSlotRange(current.startHour, current.endHour)}
                </p>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary">
                  To
                </p>
                {runs.length === 0 ? (
                  <p className="mt-1 text-gray-400">Choose the new court and time.</p>
                ) : (
                  <>
                    <p className="mt-1 font-extrabold text-navy">
                      {court?.name ?? "Choose a court"}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {formatManilaDateLong(date)}
                    </p>
                    <div className="mt-3 space-y-2">
                      {runs.map((run) => (
                        <div
                          key={run.start}
                          className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                        >
                          <span className="font-semibold text-navy">
                            {formatHourLabel(run.start)} –{" "}
                            {formatHourLabel(run.end + 1)}
                          </span>
                          <span className="shrink-0 text-xs text-gray-500">
                            {runHours(run)} {runHours(run) === 1 ? "hr" : "hrs"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {runs.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
                  <span className="text-gray-500">
                    New court total
                    {runs.length > 1 ? ` · ${runs.length} sessions` : ""}
                  </span>
                  <span className="font-extrabold text-navy">
                    {total != null ? formatPHP(total) : "Rate on request"}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-5">
              <Textarea
                label="Reason for moving (optional)"
                name="reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="The player will see this message."
                error={state.errors?.reason}
              />
            </div>

            {selectedHours > 0 && (
              <button
                type="button"
                onClick={clearHours}
                className="mt-4 text-xs font-bold text-primary hover:underline"
              >
                Clear selected hours
              </button>
            )}
          </aside>
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-4 shadow-[0_-8px_24px_rgba(15,42,59,0.06)] sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-w-0">
            {blockedReason && !pending ? (
              <p className="text-sm font-medium text-amber-800">
                {blockedReason}
              </p>
            ) : (
              <p className="text-sm font-medium text-green-700">
                Ready to move this booking to {court?.name ?? "the selected court"}.
              </p>
            )}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onDone}
              className="min-h-11 rounded-xl border border-gray-300 px-5 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Keep as is
            </button>
            <Button
              type="submit"
              disabled={pending || blockedReason !== null || !isOnline}
              className="min-h-11 sm:w-auto sm:min-w-40"
            >
              {!isOnline
                ? "Reconnect to move"
                : pending
                  ? "Moving…"
                  : "Move booking"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
