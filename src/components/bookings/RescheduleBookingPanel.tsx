"use client";

import { useActionState, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { DateStrip } from "@/components/hubs/DateStrip";
import { SlotGrid } from "@/components/hubs/SlotGrid";
import { useAvailabilityStream } from "@/hooks/useAvailabilityStream";
import {
  rescheduleHubBookingAction,
  type BookingFormState,
} from "@/lib/booking-actions";
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
import {
  formatHourLabel,
  formatManilaDateLong,
  formatSlotRange,
} from "@/lib/time";
import { COURT_TYPE_LABELS, type OperatingHours } from "@/lib/constants";

type PanelCourt = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
  scheduleRules: CourtScheduleRule[];
};

const initialState: BookingFormState = {};

// Moves an existing booking. Structurally this is BookCourtPanel, with four
// differences: it's seeded with the booking's own hours, the move must keep
// the booking the same length, the availability stream ignores this booking's
// own slots, and there's an optional reason shown to the player.
export function RescheduleBookingPanel({
  bookingId,
  courts,
  operatingHours,
  today,
  nowHour,
  current,
  onDone,
}: {
  bookingId: string;
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
      (_, i) => current.startHour + i
    )
  );
  const [reason, setReason] = useState("");
  // The picker opens showing the booking's current hours. Until the partner
  // touches the grid those are a starting point, not a choice they made.
  const [touched, setTouched] = useState(false);
  const [state, formAction, pending] = useActionState(
    rescheduleHubBookingAction,
    initialState
  );

  // The 4th arg makes the stream ignore this booking's own slots, so the hours
  // it currently holds arrive as free.
  const { bookedHours, live } = useAvailabilityStream(
    courtId,
    date,
    null,
    bookingId
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
        courtHourlyRate: court?.hourlyRate,
        scheduleRules: court?.scheduleRules,
      }),
    [operatingHours, date, bookedHours, today, nowHour, court]
  );

  // Trimmed during render, so hours taken mid-edit drop off on the next frame.
  const selected = useMemo(
    () => clampSelection(slots, picked),
    [slots, picked]
  );
  // Hours needn't be contiguous. Each unbroken run becomes its own booking —
  // this one takes the first, the rest split off.
  const runs = useMemo(() => toRuns(selected), [selected]);
  const selectedHours = selected.length;

  const total = slotTotal(slots, selected);

  const unchanged =
    runs.length === 1 &&
    courtId === current.courtId &&
    date === current.date &&
    runs[0].start === current.startHour &&
    runs[0].end + 1 === current.endHour;

  // A move keeps the booking the same length: the player reserved this much
  // time, so the venue can neither take some back nor add time they didn't
  // ask for. To change the length, cancel and let them rebook.
  const currentHours = current.endHour - current.startHour;
  const hoursLabel = `${currentHours} ${currentHours === 1 ? "hour" : "hours"}`;
  const wrongLength = selectedHours > 0 && selectedHours !== currentHours;

  // Say why the button is off rather than leaving it mysteriously dead.
  const blockedReason =
    selectedHours === 0
      ? `Pick ${hoursLabel} for the new time.`
      : wrongLength
        ? `${selectedHours} of ${currentHours} hours selected — a move keeps the booking the same length, so pick exactly ${hoursLabel}.`
        : unchanged
          ? "Pick a different court, date or time."
          : null;

  function selectCourt(id: string) {
    setCourtId(id);
    setPicked([]);
    setTouched(true);
  }

  function selectDate(next: string) {
    setDate(next);
    setPicked([]);
    setTouched(true);
  }

  function clearHours() {
    setPicked([]);
    setTouched(true);
  }

  // This is a MOVE, so the first tap on an untouched grid means "put it here",
  // replacing the hours the booking currently holds rather than adding to
  // them. Without this, tapping the new time silently doubles the booking —
  // and clearing the old hours by hand trips the minimum-length rule, leaving
  // the partner stuck with no way to proceed.
  function toggle(hour: number) {
    if (!touched) {
      setTouched(true);
      if (!selected.includes(hour)) {
        setPicked([hour]);
        return;
      }
    }
    setPicked(toggleHourIn(selected, hour));
  }

  // The success grid would still show the booking's brand-new hours as free
  // (they're excluded from the stream), so collapse instead of lingering.
  if (state.success) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-green-50 px-3 py-2.5">
        <p role="status" className="text-sm text-green-700">
          {state.success}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 text-xs font-medium text-green-700 underline"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      noValidate
      className="mt-3 flex flex-col gap-5 rounded-xl border border-gray-200 p-4"
    >
      <input type="hidden" name="id" value={bookingId} />
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

      <Select
        label="Move to court"
        name="courtChoice"
        value={courtId}
        onChange={(e) => selectCourt(e.target.value)}
        options={courts.map((c) => ({
          value: c.id,
          label: `${c.name} — ${COURT_TYPE_LABELS[c.courtType] ?? c.courtType}${
            c.hourlyRate != null ? ` · ${formatPHP(c.hourlyRate)}/hr` : ""
          }`,
        }))}
      />
      {state.errors?.courtId && (
        <p className="-mt-3 text-xs text-red-500">{state.errors.courtId}</p>
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
          <span className="flex items-baseline gap-2 text-xs">
            <span
              className={
                selectedHours === currentHours
                  ? "font-medium text-green-600"
                  : "text-gray-400"
              }
            >
              {selectedHours} of {currentHours}{" "}
              {currentHours === 1 ? "hr" : "hrs"} selected
            </span>
            {selectedHours > 0 && (
              <button
                type="button"
                onClick={clearHours}
                className="font-medium text-primary hover:underline"
              >
                Clear
              </button>
            )}
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

      <Textarea
        label="Why are you moving this booking? (optional)"
        name="reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="The player will see this, if you add one."
        error={state.errors?.reason}
      />

      {/* Before -> after, so the partner can see exactly what changes. */}
      <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="text-gray-400">From</span>
          <span className="text-right text-gray-500 line-through">
            {current.courtName} · {formatManilaDateLong(current.date)} ·{" "}
            {formatSlotRange(current.startHour, current.endHour)}
            {current.totalPrice != null
              ? ` · ${formatPHP(current.totalPrice)}`
              : ""}
          </span>
        </div>
        <div className="flex items-start justify-between gap-3">
          <span className="text-gray-400">To</span>
          {runs.length === 0 ? (
            <span className="text-right text-gray-400">Pick the new hours</span>
          ) : (
            <span className="text-right font-medium text-gray-900">
              {court?.name ?? "—"} · {formatManilaDateLong(date)}
            </span>
          )}
        </div>

        {/* A gap means separate sessions, so list each one — they become
            separate bookings the player can cancel independently. */}
        {runs.map((run) => (
          <div
            key={run.start}
            className="flex items-center justify-between gap-3 pl-8"
          >
            <span className="text-gray-700">
              {formatHourLabel(run.start)} – {formatHourLabel(run.end + 1)}
            </span>
            <span className="shrink-0 text-gray-500">
              {runHours(run)} {runHours(run) === 1 ? "hr" : "hrs"}
            </span>
          </div>
        ))}

        {runs.length > 0 && (
          <div className="flex items-center justify-between gap-3 pl-8">
            <span className="text-gray-500">
              {selectedHours} {selectedHours === 1 ? "hour" : "hours"}
              {runs.length > 1 ? ` · ${runs.length} separate bookings` : ""}
            </span>
            <span className="shrink-0 font-semibold text-gray-900">
              {total != null ? formatPHP(total) : "Rate on request"}
            </span>
          </div>
        )}

        {court && (
          <p className="text-xs text-gray-400">
            Priced from {court.name}&apos;s current weekly schedule.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {/* Above the button, not below it — this is the one thing standing
            between the partner and a working move, so it can't be a footnote
            they have to scroll past. */}
        {blockedReason && !pending && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            {blockedReason}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="submit"
            disabled={pending || blockedReason !== null}
            className="flex-1"
          >
            {pending ? "Moving…" : "Move booking"}
          </Button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
          >
            Keep as is
          </button>
        </div>
      </div>
    </form>
  );
}
