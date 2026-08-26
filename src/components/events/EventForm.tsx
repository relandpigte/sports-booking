"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { saveEventAction, type EventFormState } from "@/lib/event-actions";
import type {
  EventCourtAvailability,
  EventEditorView,
  EventFormHub,
} from "@/lib/events";
import { addDays, formatHourLabel } from "@/lib/time";
import {
  MAX_WEEKLY_EVENT_OCCURRENCES,
  weeklyEventDates,
} from "@/lib/event-recurrence";
import {
  bookingServiceFeeFor,
  MANUAL_SERVICE_FEE_PERCENT,
  manualBookingServiceFeeFor,
  SERVICE_FEE_PERCENT,
} from "@/lib/constants";

const initialState: EventFormState = {};

export function EventForm({
  hubs,
  event,
  today,
}: {
  hubs: EventFormHub[];
  event?: EventEditorView | null;
  today: string;
}) {
  const initialHub = hubs.find((hub) => hub.id === event?.hubId) ?? hubs[0];
  const [state, formAction, pending] = useActionState(
    saveEventAction,
    initialState
  );
  const [hubId, setHubId] = useState(initialHub?.id ?? "");
  const [sport, setSport] = useState(event?.sport ?? initialHub?.games[0] ?? "");
  const [date, setDate] = useState(event?.date ?? today);
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState(addDays(event?.date ?? today, 35));
  const [startHour, setStartHour] = useState(event?.startHour ?? 9);
  const [endHour, setEndHour] = useState(event?.endHour ?? 11);
  const [fee, setFee] = useState(event?.registrationFee ?? 0);
  const [selectedCourts, setSelectedCourts] = useState<string[]>(
    event?.courtIds ?? []
  );
  const [availability, setAvailability] = useState<EventCourtAvailability[]>([]);
  const [availabilityState, setAvailabilityState] = useState<
    "idle" | "ready" | "error"
  >("idle");

  const hub = useMemo(
    () => hubs.find((candidate) => candidate.id === hubId) ?? hubs[0],
    [hubId, hubs]
  );
  const serviceFee =
    hub?.paymentMode === "MANUAL"
      ? manualBookingServiceFeeFor(fee)
      : bookingServiceFeeFor(fee);
  const checkoutTotal = Math.round((fee + serviceFee) * 100) / 100;
  const locked = event?.status === "CANCELLED";
  const recurrenceDates = repeatWeekly
    ? weeklyEventDates(date, repeatUntil) ?? []
    : [date];

  useEffect(() => {
    if (!hubId || !date || endHour <= startHour) {
      return;
    }
    const controller = new AbortController();
    const query = new URLSearchParams({
      hubId,
      date,
      startHour: String(startHour),
      endHour: String(endHour),
    });
    if (event?.id) query.set("eventId", event.id);
    fetch(`/api/events/availability?${query}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Availability request failed");
        return (await response.json()) as { courts: EventCourtAvailability[] };
      })
      .then((payload) => {
        setAvailability(payload.courts);
        setAvailabilityState("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAvailabilityState("error");
      });
    return () => controller.abort();
  }, [date, endHour, event?.id, hubId, startHour]);

  function toggleCourt(courtId: string) {
    setSelectedCourts((current) =>
      current.includes(courtId)
        ? current.filter((id) => id !== courtId)
        : [...current, courtId]
    );
  }

  function chooseHub(nextHubId: string) {
    const nextHub = hubs.find((candidate) => candidate.id === nextHubId);
    setHubId(nextHubId);
    setSport(nextHub?.games[0] ?? "");
    setSelectedCourts([]);
    setAvailability([]);
    setAvailabilityState("idle");
  }

  function chooseDate(nextDate: string) {
    setDate(nextDate);
    if (repeatUntil < addDays(nextDate, 7)) {
      setRepeatUntil(addDays(nextDate, 35));
    }
  }

  return (
    <form action={formAction} className="space-y-6">
      {event?.id && <input type="hidden" name="eventId" value={event.id} />}
      <input
        type="hidden"
        name="recurrence"
        value={!event && repeatWeekly ? "weekly" : "once"}
      />
      {selectedCourts.map((courtId) => (
        <input key={courtId} type="hidden" name="courtIds" value={courtId} />
      ))}

      {state.message && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {state.message}
        </p>
      )}
      {state.success && (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {state.success}
        </p>
      )}
      {locked && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
          This event is cancelled and can no longer be edited.
        </p>
      )}

      <FormSection number="01" title="Event details" description="Give players a clear reason to join.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Hub" error={state.errors?.hubId}>
            <select
              name="hubId"
              value={hubId}
              onChange={(input) => chooseHub(input.target.value)}
              disabled={locked}
              className={inputClass}
            >
              {hubs.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Sport" error={state.errors?.sport}>
            <select
              name="sport"
              value={sport}
              onChange={(input) => setSport(input.target.value)}
              disabled={locked}
              className={inputClass}
            >
              {hub?.games.map((game) => <option key={game}>{game}</option>)}
            </select>
          </Field>
          <Field label="Event title" error={state.errors?.title} className="sm:col-span-2">
            <input
              name="title"
              defaultValue={event?.title ?? "Open Play"}
              maxLength={120}
              disabled={locked}
              className={inputClass}
              placeholder="Saturday Open Play"
            />
          </Field>
          <Field label="Description" error={state.errors?.description} className="sm:col-span-2">
            <textarea
              name="description"
              defaultValue={event?.description ?? ""}
              rows={5}
              maxLength={3000}
              disabled={locked}
              className={inputClass}
              placeholder="Share the level, format, what to bring, and any venue notes."
            />
          </Field>
        </div>
      </FormSection>

      <FormSection number="02" title="Schedule" description="One shared time block applies to every selected court.">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Date" error={state.errors?.date}>
            <input name="date" type="date" min={today} value={date} onChange={(input) => chooseDate(input.target.value)} disabled={locked} className={inputClass} />
          </Field>
          <Field label="Start time" error={state.errors?.startHour}>
            <select name="startHour" value={startHour} onChange={(input) => setStartHour(Number(input.target.value))} disabled={locked} className={inputClass}>
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{formatHourLabel(hour)}</option>)}
            </select>
          </Field>
          <Field label="End time" error={state.errors?.endHour}>
            <select name="endHour" value={endHour} onChange={(input) => setEndHour(Number(input.target.value))} disabled={locked} className={inputClass}>
              {Array.from({ length: 24 }, (_, index) => index + 1).map((hour) => <option key={hour} value={hour}>{formatHourLabel(hour)}</option>)}
            </select>
          </Field>
        </div>
        {!event ? (
          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={repeatWeekly}
                onChange={(input) => setRepeatWeekly(input.target.checked)}
                className="mt-0.5 h-5 w-5 accent-primary"
              />
              <span>
                <span className="block text-sm font-black text-navy">
                  Repeat every week
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Create a separate event for each week so registrations,
                  payments, and cancellations stay independent.
                </span>
              </span>
            </label>
            {repeatWeekly ? (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <Field label="Repeat until" error={state.errors?.repeatUntil}>
                  <input
                    name="repeatUntil"
                    type="date"
                    min={addDays(date, 7)}
                    max={addDays(date, (MAX_WEEKLY_EVENT_OCCURRENCES - 1) * 7)}
                    value={repeatUntil}
                    onChange={(input) => setRepeatUntil(input.target.value)}
                    className={inputClass}
                  />
                </Field>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {recurrenceDates.length >= 2
                    ? `${recurrenceDates.length} weekly events will be created. Publishing checks every date before reserving any court time.`
                    : `Choose an end date at least one week later. A series can contain up to ${MAX_WEEKLY_EVENT_OCCURRENCES} events.`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </FormSection>

      <FormSection number="03" title="Courts" description="Unavailable courts are protected by bookings, events, operating hours, or weekly closures.">
        {availabilityState === "error" && <p className="text-sm font-medium text-red-600">Availability could not be loaded. You can save a draft, but publishing will run the check again.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {hub?.courts.map((court) => {
            const result = availability.find((item) => item.id === court.id);
            const unavailable = result ? !result.available : false;
            const checked = selectedCourts.includes(court.id);
            return (
              <label
                key={court.id}
                className={`flex min-h-20 items-center gap-4 rounded-2xl border p-4 transition-colors ${
                  checked
                    ? "border-primary bg-primary-soft"
                    : unavailable
                      ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-65"
                      : "cursor-pointer border-slate-200 bg-white hover:border-primary/40"
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleCourt(court.id)} disabled={locked || unavailable} className="h-5 w-5 accent-primary" />
                <span className="min-w-0">
                  <span className="block font-bold text-navy">{court.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{result?.reason ?? court.courtType}</span>
                </span>
              </label>
            );
          })}
        </div>
        {state.errors?.courtIds && <p className="mt-2 text-sm font-medium text-red-600">{state.errors.courtIds}</p>}
      </FormSection>

      <FormSection number="04" title="Capacity & price" description={hub?.paymentMode === "MANUAL" ? `Players transfer the registration fee plus Bunal's ${MANUAL_SERVICE_FEE_PERCENT}% service fee and upload a receipt for review.` : `Players pay the registration fee plus Bunal's ${SERVICE_FEE_PERCENT}% service fee. PayMongo processing is handled separately.`}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Player capacity" error={state.errors?.capacity}>
            <input name="capacity" type="number" min={2} max={500} defaultValue={event?.capacity ?? 16} disabled={locked} className={inputClass} />
          </Field>
          <Field label="Registration fee per player" error={state.errors?.registrationFee} hint={hub && !hub.paymentReady ? "This hub can publish free events. Finish the selected payment setup to charge a fee." : "Enter 0 for a free event."}>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-3.5 font-bold text-slate-400">₱</span>
              <input name="registrationFee" type="number" min={0} step="0.01" value={fee} onChange={(input) => setFee(Number(input.target.value))} disabled={locked} className={`${inputClass} pl-9`} />
            </div>
          </Field>
        </div>
        <div className="mt-5 rounded-2xl bg-navy p-5 text-white">
          <div className="flex items-center justify-between text-sm"><span className="text-white/60">Registration fee</span><strong>₱{fee.toFixed(2)}</strong></div>
          <div className="mt-2 flex items-center justify-between text-sm"><span className="text-white/60">Bunal service fee ({hub?.paymentMode === "MANUAL" ? MANUAL_SERVICE_FEE_PERCENT : SERVICE_FEE_PERCENT}%)</span><strong>₱{serviceFee.toFixed(2)}</strong></div>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4"><span className="font-bold">Player checkout total</span><strong className="text-xl text-accent">₱{checkoutTotal.toFixed(2)}</strong></div>
          <p className="mt-2 text-xs text-white/45">{hub?.paymentMode === "MANUAL" ? "Manual payments stay pending until you approve the player's receipt." : "The registration fee is paid directly to your connected venue account."}</p>
        </div>
      </FormSection>

      {!locked && (
        <div className="sticky bottom-4 z-10 flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:justify-end">
          {event?.status !== "PUBLISHED" && (
            <button name="intent" value="draft" disabled={pending} className="min-h-11 rounded-xl border border-slate-300 px-5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Save draft</button>
          )}
          <button name="intent" value="publish" disabled={pending || selectedCourts.length === 0} className="min-h-11 rounded-xl bg-primary px-6 text-sm font-black text-white shadow-sm shadow-primary/20 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
            {pending
              ? "Saving…"
              : event?.status === "PUBLISHED"
                ? "Save changes"
                : repeatWeekly
                  ? `Publish ${recurrenceDates.length || "weekly"} events`
                  : "Publish event"}
          </button>
        </div>
      )}
    </form>
  );
}

const inputClass = "min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-navy outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-100 disabled:text-slate-500";

function FormSection({ number, title, description, children }: { number: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-navy/5 sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-xs font-black text-primary">{number}</span>
        <div><h2 className="text-xl font-black text-navy">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, error, hint, className = "", children }: { label: string; error?: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
      {error ? <span className="mt-1.5 block text-xs font-medium text-red-600">{error}</span> : hint ? <span className="mt-1.5 block text-xs leading-5 text-slate-400">{hint}</span> : null}
    </label>
  );
}
