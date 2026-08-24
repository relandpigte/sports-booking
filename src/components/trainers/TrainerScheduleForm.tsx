"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  addTrainerExceptionAction,
  deleteTrainerExceptionAction,
  saveTrainerScheduleAction,
  type TrainerActionState,
} from "@/lib/trainer-actions";
import { formatHourLabel } from "@/lib/time";

const initialState: TrainerActionState = {};
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const hourOptions = Array.from({ length: 25 }, (_, hour) => ({
  value: String(hour),
  label: formatHourLabel(hour),
}));

export function TrainerScheduleForm({
  rules,
  exceptions,
}: {
  rules: Array<{ dayOfWeek: number; startHour: number; endHour: number }>;
  exceptions: Array<{
    id: string;
    date: string;
    startHour: number;
    endHour: number;
    type: "AVAILABLE" | "UNAVAILABLE";
    note: string | null;
  }>;
}) {
  const [state, action, pending] = useActionState(
    saveTrainerScheduleAction,
    initialState
  );
  const [exceptionState, exceptionAction, exceptionPending] = useActionState(
    addTrainerExceptionAction,
    initialState
  );

  return (
    <div className="mt-6 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <form
        action={action}
        className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm"
      >
        <div className="flex items-start gap-3 border-b border-[#e8efeb] px-5 py-5 sm:px-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <CalendarIcon />
          </span>
          <div>
            <h2 className="text-lg font-black text-navy">
              Recurring weekly availability
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Turn on the days you coach, then set one continuous window for
              each day.
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {(state.message || state.success) && (
            <p
              role={state.success ? "status" : "alert"}
              className={`mb-4 rounded-xl border p-3 text-sm ${
                state.success
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {state.success ?? state.message}
            </p>
          )}

          <div className="hidden grid-cols-[minmax(150px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] gap-3 px-4 pb-2 text-xs font-black uppercase tracking-wider text-slate-400 sm:grid">
            <span>Day</span>
            <span>From</span>
            <span>Until</span>
          </div>
          <div className="space-y-2">
            {days.map((day, dayOfWeek) => {
              const rule = rules.find(
                (item) => item.dayOfWeek === dayOfWeek
              );

              return (
                <div
                  key={day}
                  className={`grid items-center gap-3 rounded-xl border p-3 transition sm:grid-cols-[minmax(150px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)] ${
                    rule
                      ? "border-primary/30 bg-primary-soft/40"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-black text-navy">
                    <input
                      type="checkbox"
                      name="dayOfWeek"
                      value={dayOfWeek}
                      defaultChecked={Boolean(rule)}
                      className="h-5 w-5 rounded accent-primary"
                    />
                    {day}
                  </label>
                  <Select
                    label="From"
                    name={`startHour-${dayOfWeek}`}
                    defaultValue={String(rule?.startHour ?? 9)}
                    options={hourOptions.slice(0, 24)}
                  />
                  <Select
                    label="Until"
                    name={`endHour-${dayOfWeek}`}
                    defaultValue={String(rule?.endHour ?? 17)}
                    options={hourOptions.slice(1)}
                  />
                </div>
              );
            })}
          </div>
          {state.errors?.schedule && (
            <p className="mt-2 text-xs text-red-500">
              {state.errors.schedule}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-[#e8efeb] bg-[#fbfdfc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-slate-500">
            Existing confirmed sessions remain reserved.
          </p>
          <Button
            type="submit"
            disabled={pending}
            className="sm:w-auto sm:px-8"
          >
            {pending ? "Saving…" : "Save weekly schedule"}
          </Button>
        </div>
      </form>

      <div className="space-y-5">
        <form
          action={exceptionAction}
          className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"
        >
          <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
            One-date override
          </p>
          <h2 className="mt-1 text-lg font-black text-navy">Date exception</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Close scheduled hours or add extra availability for a specific date.
          </p>

          {(exceptionState.message || exceptionState.success) && (
            <p
              role={exceptionState.success ? "status" : "alert"}
              className={`mt-4 rounded-xl border p-3 text-sm ${
                exceptionState.success
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {exceptionState.success ?? exceptionState.message}
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <Input
              label="Date"
              name="date"
              type="date"
              required
              error={exceptionState.errors?.date}
            />
            <Select
              label="Type"
              name="type"
              options={[
                { value: "UNAVAILABLE", label: "Close these hours" },
                { value: "AVAILABLE", label: "Add these hours" },
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="From"
                name="startHour"
                options={hourOptions.slice(0, 24)}
              />
              <Select
                label="Until"
                name="endHour"
                defaultValue="17"
                options={hourOptions.slice(1)}
              />
            </div>
            <Input label="Note (optional)" name="note" />
          </div>
          <Button type="submit" disabled={exceptionPending} className="mt-5">
            {exceptionPending ? "Adding…" : "Add exception"}
          </Button>
        </form>

        <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                Overrides
              </p>
              <h2 className="mt-1 text-lg font-black text-navy">
                Saved exceptions
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
              {exceptions.length}
            </span>
          </div>

          {exceptions.length > 0 ? (
            <div className="mt-4 space-y-2">
              {exceptions.map((exception) => (
                <div
                  key={exception.id}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-navy">
                        {exception.date}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {formatHourLabel(exception.startHour)}–
                        {formatHourLabel(exception.endHour)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-black ${
                        exception.type === "AVAILABLE"
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {exception.type === "AVAILABLE" ? "Added" : "Closed"}
                    </span>
                  </div>
                  {exception.note && (
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {exception.note}
                    </p>
                  )}
                  <form action={deleteTrainerExceptionAction} className="mt-3">
                    <input
                      type="hidden"
                      name="exceptionId"
                      value={exception.id}
                    />
                    <button className="min-h-10 rounded-lg bg-red-50 px-3 text-xs font-bold text-red-600 transition hover:bg-red-100">
                      Remove exception
                    </button>
                  </form>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <CalendarIcon />
              </span>
              <p className="mt-3 text-sm font-bold text-navy">
                No exceptions yet
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Your weekly schedule applies to every date.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3" />
    </svg>
  );
}
