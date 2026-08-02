"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import {
  updateCourtScheduleAction,
  type CourtScheduleFormState,
} from "@/lib/court-schedule-actions";
import {
  WEEKDAYS,
  type OperatingHours,
  type Weekday,
} from "@/lib/constants";
import { formatPHP } from "@/lib/currency";
import {
  dayWindow,
  type CourtScheduleRule,
} from "@/lib/slots";
import { formatHourLabel } from "@/lib/time";

type EditorCourt = {
  id: string;
  name: string;
  hourlyRate: number | null;
  scheduleRules: CourtScheduleRule[];
};

type LockedSlot = {
  courtId: string;
  weekday: number;
  hour: number;
};

const initialState: CourtScheduleFormState = {};

export function CourtScheduleEditor({
  hubId,
  hubName,
  courts,
  operatingHours,
  lockedSlots,
}: {
  hubId: string;
  hubName: string;
  courts: EditorCourt[];
  operatingHours: OperatingHours | null;
  lockedSlots: LockedSlot[];
}) {
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [weekday, setWeekday] = useState(0);
  const [rules, setRules] = useState<CourtScheduleRule[]>(() =>
    courts.flatMap((court) =>
      court.scheduleRules.map((rule) => ({ ...rule, courtId: court.id }))
    ) as (CourtScheduleRule & { courtId: string })[]
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [batchRate, setBatchRate] = useState("");
  const [batchClosureReason, setBatchClosureReason] = useState("");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    updateCourtScheduleAction,
    initialState
  );

  const court = courts.find((item) => item.id === courtId) ?? courts[0];
  const day = WEEKDAYS[weekday];
  const window = day && operatingHours
    ? dayWindow(operatingHours[day.value as Weekday])
    : null;
  const hours = window
    ? Array.from({ length: window.end - window.start }, (_, index) =>
        window.start + index
      )
    : [];

  const locked = useMemo(
    () =>
      new Set(
        lockedSlots.map(
          (slot) => `${slot.courtId}:${slot.weekday}:${slot.hour}`
        )
      ),
    [lockedSlots]
  );

  const activeRules = rules.filter(
    (rule) =>
      "courtId" in rule &&
      rule.courtId === court?.id &&
      rule.weekday === weekday
  ) as (CourtScheduleRule & { courtId: string })[];
  const closedCount = activeRules.filter((rule) => rule.closed).length;
  const openCount = Math.max(0, hours.length - closedCount);
  const effectiveRates = hours.flatMap((hour) => {
    const rule = activeRules.find((item) => item.hour === hour);
    const rate = rule?.hourlyRate ?? court?.hourlyRate;
    return !rule?.closed && rate != null ? [rate] : [];
  });
  const minRate = effectiveRates.length ? Math.min(...effectiveRates) : null;
  const maxRate = effectiveRates.length ? Math.max(...effectiveRates) : null;

  function switchCourt(nextCourtId: string) {
    setCourtId(nextCourtId);
    setSelected([]);
    setBatchRate("");
    setBatchClosureReason("");
    setLocalMessage(null);
  }

  function switchDay(nextWeekday: number) {
    setWeekday(nextWeekday);
    setSelected([]);
    setBatchRate("");
    setBatchClosureReason("");
    setLocalMessage(null);
  }

  function ruleFor(hour: number) {
    return activeRules.find((rule) => rule.hour === hour);
  }

  function updateRule(
    hour: number,
    patch: Partial<
      Pick<CourtScheduleRule, "closed" | "closureReason" | "hourlyRate">
    >
  ) {
    if (!court) return;
    setRules((current) => {
      const typed = current as (CourtScheduleRule & { courtId: string })[];
      const index = typed.findIndex(
        (rule) =>
          rule.courtId === court.id &&
          rule.weekday === weekday &&
          rule.hour === hour
      );
      const existing = index >= 0 ? typed[index] : null;
      const next = {
        courtId: court.id,
        weekday,
        hour,
        closed: patch.closed ?? existing?.closed ?? false,
        closureReason:
          patch.closureReason !== undefined
            ? patch.closureReason
            : existing?.closureReason ?? null,
        hourlyRate:
          patch.hourlyRate !== undefined
            ? patch.hourlyRate
            : existing?.hourlyRate ?? null,
      };
      if (!next.closed) next.closureReason = null;
      const copy = [...typed];
      if (!next.closed && next.hourlyRate == null) {
        if (index >= 0) copy.splice(index, 1);
      } else if (index >= 0) {
        copy[index] = next;
      } else {
        copy.push(next);
      }
      return copy;
    });
  }

  function toggleSelected(hour: number) {
    setSelected((current) =>
      current.includes(hour)
        ? current.filter((item) => item !== hour)
        : [...current, hour].sort((a, b) => a - b)
    );
  }

  function selectAll() {
    if (!court) return;
    const selectable = hours.filter(
      (hour) => !locked.has(`${court.id}:${weekday}:${hour}`)
    );
    setSelected((current) =>
      current.length === selectable.length ? [] : selectable
    );
  }

  function markSelected(closed: boolean) {
    const reason = batchClosureReason.trim();
    for (const hour of selected) {
      updateRule(hour, {
        closed,
        closureReason: closed ? reason || null : null,
      });
    }
    setLocalMessage(
      `${selected.length} ${selected.length === 1 ? "slot" : "slots"} marked ${closed ? `closed${reason ? ` (${reason})` : ""}` : "open"}. Save to publish the change.`
    );
  }

  function applyBatchRate() {
    if (batchRate.trim() === "") {
      setLocalMessage("Enter a rate, or choose Use default.");
      return;
    }
    const rate = Number(batchRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1_000_000) {
      setLocalMessage("Enter a valid hourly rate.");
      return;
    }
    const normalized = Math.round(rate * 100) / 100;
    for (const hour of selected) updateRule(hour, { hourlyRate: normalized });
    setLocalMessage(
      `${selected.length} ${selected.length === 1 ? "slot" : "slots"} set to ${formatPHP(normalized)} per hour.`
    );
  }

  function useDefaultForSelected() {
    for (const hour of selected) updateRule(hour, { hourlyRate: null });
    setBatchRate("");
    setLocalMessage(
      `${selected.length} ${selected.length === 1 ? "slot" : "slots"} will use the court default.`
    );
  }

  const serializableRules = (rules as (CourtScheduleRule & {
    courtId: string;
  })[]).map((rule) => ({
    courtId: rule.courtId,
    weekday: rule.weekday,
    hour: rule.hour,
    closed: rule.closed,
    closureReason: rule.closureReason ?? null,
    hourlyRate: rule.hourlyRate,
  }));

  if (!court) return null;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="hubId" value={hubId} />
      <input
        type="hidden"
        name="rules"
        value={JSON.stringify(serializableRules)}
      />

      <div>
        <Link
          href="/dashboard/hubs"
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-gray-500 transition-colors hover:text-primary"
        >
          ← Back to My Hubs
        </Link>
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Venue management
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-navy">
            Court schedule
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
            Set recurring weekly availability and hourly rates for {hubName}.
            Upcoming bookings stay protected.
          </p>
        </div>
      </div>

      {(state.message || state.success || localMessage) && (
        <div
          role={state.message ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-sm ${
            state.message
              ? "bg-red-50 text-red-700"
              : state.success
                ? "bg-green-50 text-green-700"
                : "bg-ocean-soft text-navy"
          }`}
        >
          {state.message ?? state.success ?? localMessage}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            Select court
          </h2>
          <span className="text-xs text-gray-400">
            {courts.length} {courts.length === 1 ? "court" : "courts"}
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {courts.map((item) => {
            const active = item.id === court.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => switchCourt(item.id)}
                className={`min-w-52 flex-1 rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${
                  active
                    ? "border-2 border-primary"
                    : "border-[#dfe7e2] hover:border-gray-300"
                }`}
              >
                <span className="block font-bold text-navy">{item.name}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Default: {item.hourlyRate != null
                    ? `${formatPHP(item.hourlyRate)}/hr`
                    : "Rate on request"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5">
        <div className="flex gap-1 overflow-x-auto border-b border-gray-100 p-2">
          {WEEKDAYS.map((item, index) => (
            <button
              key={item.value}
              type="button"
              onClick={() => switchDay(index)}
              className={`min-h-11 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                weekday === index
                  ? "bg-navy text-white"
                  : "text-gray-500 hover:bg-gray-50 hover:text-navy"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-gray-100 px-5 py-4 text-sm text-gray-500">
          <span>
            <strong className="text-navy">{court.name}</strong> · {day?.label}
          </span>
          <span>
            <strong className="text-navy">{openCount}</strong> open ·{" "}
            <strong className="text-navy">{closedCount}</strong> closed
          </span>
          <span>
            Rate: {minRate == null
              ? "On request"
              : minRate === maxRate
                ? `${formatPHP(minRate)}/hr`
                : `${formatPHP(minRate)}–${formatPHP(maxRate ?? minRate)}/hr`}
          </span>
        </div>

        {!window ? (
          <div className="px-6 py-14 text-center">
            <p className="font-semibold text-navy">The hub is closed on {day?.label}.</p>
            <p className="mt-1 text-sm text-gray-500">
              Change the hub operating hours first to add court slots here.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[48px_minmax(180px,1fr)_130px_minmax(240px,300px)] items-center border-b border-gray-100 bg-[#f7faf8] px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400 md:grid">
              <input
                type="checkbox"
                aria-label="Select all editable slots"
                checked={
                  selected.length > 0 &&
                  selected.length ===
                    hours.filter(
                      (hour) =>
                        !locked.has(`${court.id}:${weekday}:${hour}`)
                    ).length
                }
                onChange={selectAll}
                className="h-4 w-4 accent-primary"
              />
              <span>Time slot</span>
              <span>Status</span>
              <span>Rate / closure reason</span>
            </div>

            <div className="divide-y divide-gray-100">
              {hours.map((hour) => {
                const rule = ruleFor(hour);
                const isClosed = rule?.closed === true;
                const isLocked = locked.has(
                  `${court.id}:${weekday}:${hour}`
                );
                const override = rule?.hourlyRate ?? null;

                return (
                  <div
                    key={hour}
                    className={`grid grid-cols-[36px_1fr] gap-x-3 gap-y-3 px-5 py-4 transition-colors md:grid-cols-[48px_minmax(180px,1fr)_130px_minmax(240px,300px)] md:items-center md:gap-0 ${
                      isClosed ? "bg-gray-50" : "hover:bg-[#f7faf8]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select ${formatHourLabel(hour)}`}
                      checked={selected.includes(hour)}
                      disabled={isLocked}
                      onChange={() => toggleSelected(hour)}
                      className="h-4 w-4 accent-primary disabled:opacity-35"
                    />
                    <div>
                      <p
                        className={`font-semibold ${
                          isClosed ? "text-gray-400 line-through" : "text-navy"
                        }`}
                      >
                        {formatHourLabel(hour)} – {formatHourLabel(hour + 1)}
                      </p>
                      {isLocked && (
                        <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-ocean">
                          Upcoming booking · cannot close
                        </p>
                      )}
                    </div>
                    <div className="col-start-2 md:col-start-auto">
                      <button
                        type="button"
                        disabled={isLocked && !isClosed}
                        onClick={() =>
                          updateRule(hour, {
                            closed: !isClosed,
                            closureReason: isClosed
                              ? null
                              : rule?.closureReason ?? null,
                          })
                        }
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          isClosed
                            ? "bg-gray-200 text-gray-600"
                            : "bg-primary-soft text-primary"
                        }`}
                      >
                        {isClosed ? "Closed" : isLocked ? "Locked open" : "Open"}
                      </button>
                    </div>
                    <div className="col-start-2 md:col-start-auto">
                      {isClosed ? (
                        <label className="block">
                          <span className="sr-only">
                            Closure reason for {formatHourLabel(hour)}
                          </span>
                          <input
                            type="text"
                            value={rule?.closureReason ?? ""}
                            maxLength={120}
                            placeholder="Reason, e.g. maintenance"
                            onChange={(event) =>
                              updateRule(hour, {
                                closureReason: event.target.value,
                              })
                            }
                            className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-navy outline-none placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
                          />
                        </label>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex min-h-10 min-w-36 flex-1 items-center rounded-lg border border-gray-200 bg-white px-3 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                            <span className="mr-1 text-sm text-gray-400">₱</span>
                            <input
                              type="number"
                              min="0"
                              max="1000000"
                              step="0.01"
                              value={override ?? ""}
                              placeholder={
                                court.hourlyRate != null
                                  ? court.hourlyRate.toFixed(2)
                                  : "Rate"
                              }
                              onChange={(event) =>
                                updateRule(hour, {
                                  hourlyRate:
                                    event.target.value === ""
                                      ? null
                                      : Number(event.target.value),
                                })
                              }
                              aria-label={`Hourly rate for ${formatHourLabel(hour)}`}
                              className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-navy outline-none"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={override == null}
                            onClick={() => updateRule(hour, { hourlyRate: null })}
                            className="text-xs font-semibold text-primary hover:underline disabled:text-gray-400 disabled:no-underline"
                          >
                            {override == null ? "Using default" : "Use default"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {selected.length > 0 && (
        <div className="sticky bottom-4 z-10 rounded-2xl bg-navy p-3 text-white shadow-xl shadow-navy/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 px-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-navy">
                {selected.length}
              </span>
              <span className="text-sm font-semibold">
                {selected.length === 1 ? "Slot selected" : "Slots selected"}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <input
                type="text"
                value={batchClosureReason}
                maxLength={120}
                onChange={(event) => setBatchClosureReason(event.target.value)}
                placeholder="Closure reason (optional)"
                className="min-h-10 rounded-lg border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/45 focus:border-accent sm:w-48"
              />
              <div className="flex min-h-10 items-center rounded-lg bg-white px-3 text-navy">
                <span className="mr-1 text-sm text-gray-400">₱</span>
                <input
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={batchRate}
                  onChange={(event) => setBatchRate(event.target.value)}
                  placeholder="Batch hourly rate"
                  className="w-full min-w-0 bg-transparent text-sm font-semibold outline-none sm:w-36"
                />
              </div>
              <button
                type="button"
                onClick={applyBatchRate}
                className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold hover:bg-white/10"
              >
                Set rate
              </button>
              <button
                type="button"
                onClick={useDefaultForSelected}
                className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold hover:bg-white/10"
              >
                Use default
              </button>
              <button
                type="button"
                onClick={() => markSelected(false)}
                className="min-h-10 rounded-lg border border-white/20 px-3 text-xs font-bold text-accent hover:bg-white/10"
              >
                Mark open
              </button>
              <button
                type="button"
                onClick={() => markSelected(true)}
                className="min-h-10 rounded-lg bg-white px-3 text-xs font-bold text-navy hover:bg-gray-100"
              >
                Mark closed
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/dashboard/hubs"
          className="inline-flex min-h-12 items-center justify-center rounded-xl border border-[#dfe7e2] bg-white px-7 text-sm font-bold text-navy hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-7 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save weekly schedule"}
        </button>
      </div>
    </form>
  );
}
