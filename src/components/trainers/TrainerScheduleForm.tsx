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
const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hourOptions = Array.from({ length: 25 }, (_, hour) => ({ value: String(hour), label: formatHourLabel(hour) }));

export function TrainerScheduleForm({
  rules,
  exceptions,
}: {
  rules: Array<{ dayOfWeek: number; startHour: number; endHour: number }>;
  exceptions: Array<{ id: string; date: string; startHour: number; endHour: number; type: "AVAILABLE" | "UNAVAILABLE"; note: string | null }>;
}) {
  const [state, action, pending] = useActionState(saveTrainerScheduleAction, initialState);
  const [exceptionState, exceptionAction, exceptionPending] = useActionState(addTrainerExceptionAction, initialState);
  return (
    <div className="space-y-5">
      <form action={action} className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-navy">Recurring weekly availability</h2>
        <p className="mt-1 text-sm text-slate-500">Players request whole, consecutive hours inside these windows.</p>
        {(state.message || state.success) && <p className={`mt-3 text-sm ${state.success ? "text-green-700" : "text-red-700"}`}>{state.success ?? state.message}</p>}
        <div className="mt-5 space-y-3">
          {days.map((day, dayOfWeek) => {
            const rule = rules.find((item) => item.dayOfWeek === dayOfWeek);
            return (
              <div key={day} className="grid items-center gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[170px_1fr_1fr]">
                <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-navy">
                  <input type="checkbox" name="dayOfWeek" value={dayOfWeek} defaultChecked={Boolean(rule)} className="h-4 w-4 accent-primary" /> {day}
                </label>
                <Select label="From" name={`startHour-${dayOfWeek}`} defaultValue={String(rule?.startHour ?? 9)} options={hourOptions.slice(0, 24)} />
                <Select label="Until" name={`endHour-${dayOfWeek}`} defaultValue={String(rule?.endHour ?? 17)} options={hourOptions.slice(1)} />
              </div>
            );
          })}
        </div>
        {state.errors?.schedule && <p className="mt-2 text-xs text-red-500">{state.errors.schedule}</p>}
        <Button type="submit" disabled={pending} className="mt-5 sm:w-auto sm:px-8">{pending ? "Saving…" : "Save weekly schedule"}</Button>
      </form>

      <form action={exceptionAction} className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-black text-navy">Date exception</h2>
        <p className="mt-1 text-sm text-slate-500">Close scheduled hours or add extra availability for one date.</p>
        {(exceptionState.message || exceptionState.success) && <p className={`mt-3 text-sm ${exceptionState.success ? "text-green-700" : "text-red-700"}`}>{exceptionState.success ?? exceptionState.message}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input label="Date" name="date" type="date" required error={exceptionState.errors?.date} />
          <Select label="Type" name="type" options={[{ value: "UNAVAILABLE", label: "Close these hours" }, { value: "AVAILABLE", label: "Add these hours" }]} />
          <Select label="From" name="startHour" options={hourOptions.slice(0, 24)} />
          <Select label="Until" name="endHour" defaultValue="17" options={hourOptions.slice(1)} />
          <div className="sm:col-span-2 lg:col-span-4"><Input label="Note (optional)" name="note" /></div>
        </div>
        <Button type="submit" disabled={exceptionPending} className="mt-5 sm:w-auto sm:px-8">{exceptionPending ? "Adding…" : "Add exception"}</Button>
      </form>
      {exceptions.length > 0 && <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm"><h2 className="text-lg font-black text-navy">Saved exceptions</h2><div className="mt-4 space-y-2">{exceptions.map((exception) => <div key={exception.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"><div><p className="text-sm font-bold text-navy">{exception.date} · {formatHourLabel(exception.startHour)}–{formatHourLabel(exception.endHour)}</p><p className="mt-1 text-xs text-slate-500">{exception.type === "AVAILABLE" ? "Extra availability" : "Unavailable"}{exception.note ? ` · ${exception.note}` : ""}</p></div><form action={deleteTrainerExceptionAction}><input type="hidden" name="exceptionId" value={exception.id} /><button className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600">Remove</button></form></div>)}</div></section>}
    </div>
  );
}
