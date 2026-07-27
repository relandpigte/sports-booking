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
import { buildSlots, clampContiguous, toggleContiguousHour } from "@/lib/slots";
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
};

const initialState: BookingFormState = {};

// Moves an existing booking. Structurally this is BookCourtPanel, with four
// differences: it's seeded with the booking's own hours, the selection must
// stay ONE contiguous block (a Booking is one range), the availability stream
// ignores this booking's own slots, and a reason is required.
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
      }),
    [operatingHours, date, bookedHours, today, nowHour]
  );

  // Trimmed during render, and kept to a single run.
  const selected = useMemo(
    () => clampContiguous(slots, picked),
    [slots, picked]
  );
  const selectedHours = selected.length;
  const startHour = selected[0] ?? null;
  const endHour = startHour != null ? startHour + selectedHours : null;

  const total =
    court?.hourlyRate != null ? court.hourlyRate * selectedHours : null;

  const unchanged =
    courtId === current.courtId &&
    date === current.date &&
    startHour === current.startHour &&
    endHour === current.endHour;

  function selectCourt(id: string) {
    setCourtId(id);
    setPicked([]);
  }

  function selectDate(next: string) {
    setDate(next);
    setPicked([]);
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
          <span className="text-xs text-gray-400">
            One continuous block — tapping away starts a new one
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
            onToggle={(hour) => setPicked(toggleContiguousHour(selected, hour))}
            loading={bookedHours == null}
            live={live}
          />
        )}
        {state.errors?.hours && (
          <p className="text-xs text-red-500">{state.errors.hours}</p>
        )}
      </div>

      <Textarea
        label="Why are you moving this booking?"
        name="reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="The player will see this."
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
          <span className="text-right font-medium text-gray-900">
            {startHour != null && endHour != null ? (
              <>
                {court?.name ?? "—"} · {formatManilaDateLong(date)} ·{" "}
                {formatHourLabel(startHour)} – {formatHourLabel(endHour)} (
                {selectedHours}
                {selectedHours === 1 ? " hr" : " hrs"})
                {total != null ? ` · ${formatPHP(total)}` : ""}
              </>
            ) : (
              <span className="font-normal text-gray-400">
                Pick the new hours
              </span>
            )}
          </span>
        </div>
        {court?.hourlyRate != null && (
          <p className="text-xs text-gray-400">
            Priced at {court.name}&apos;s current rate,{" "}
            {formatPHP(court.hourlyRate)}/hr.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={
            selectedHours === 0 || pending || unchanged || reason.trim().length < 3
          }
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
    </form>
  );
}
