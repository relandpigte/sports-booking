"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { requestTrainerSessionAction, type TrainerActionState } from "@/lib/trainer-actions";
import { formatHourLabel } from "@/lib/time";
import { bookingServiceFeeFor } from "@/lib/constants";

const initialState: TrainerActionState = {};
const starts = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: formatHourLabel(hour) }));
const ends = Array.from({ length: 24 }, (_, index) => ({ value: String(index + 1), label: formatHourLabel(index + 1) }));

export function TrainerRequestForm({ trainerProfileId, hourlyRate, minDate, maxDate }: { trainerProfileId: string; hourlyRate: number; minDate: string; maxDate: string }) {
  const [state, action, pending] = useActionState(requestTrainerSessionAction, initialState);
  const [startHour, setStartHour] = useState("9");
  const [endHour, setEndHour] = useState("10");
  const hours = Math.max(1, Number(endHour) - Number(startHour));
  const trainerAmount = Math.round(hourlyRate * hours * 100) / 100;
  const bunalFee = bookingServiceFeeFor(trainerAmount);
  return (
    <form action={action} className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm">
      <input type="hidden" name="trainerProfileId" value={trainerProfileId} />
      <h2 className="text-lg font-black text-navy">Request a session</h2>
      <p className="mt-1 text-sm text-slate-500">Request at least 24 hours ahead. You pay only after the trainer accepts.</p>
      {(state.message || state.success) && <p className={`mt-3 rounded-xl p-3 text-sm ${state.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{state.success ?? state.message}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Input label="Date" name="date" type="date" min={minDate} max={maxDate} required error={state.errors?.date} />
        <Select
          label="Start"
          name="startHour"
          value={startHour}
          onChange={(event) => {
            const nextStart = event.target.value;
            setStartHour(nextStart);
            if (Number(endHour) <= Number(nextStart)) {
              setEndHour(String(Math.min(24, Number(nextStart) + 1)));
            }
          }}
          options={starts}
        />
        <Select label="End" name="endHour" value={endHour} onChange={(event) => setEndHour(event.target.value)} options={ends.filter((option) => Number(option.value) > Number(startHour))} />
      </div>
      <div className="mt-4"><Textarea label="Session notes" name="notes" rows={4} required error={state.errors?.notes} placeholder="Tell the trainer your goals, level, and how many people will attend." /></div>
      <dl className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between"><dt>Trainer · {hours} {hours === 1 ? "hour" : "hours"}</dt><dd>₱{trainerAmount.toFixed(2)}</dd></div><div className="flex justify-between"><dt>Bunal fee (3%)</dt><dd>₱{bunalFee.toFixed(2)}</dd></div><div className="flex justify-between border-t border-slate-200 pt-2 font-black text-navy"><dt>Total before payment processing</dt><dd>₱{(trainerAmount + bunalFee).toFixed(2)}</dd></div></dl>
      <Button type="submit" disabled={pending} className="mt-4">{pending ? "Sending request…" : "Request available time"}</Button>
    </form>
  );
}
