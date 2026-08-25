"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useActionState,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { Role } from "@prisma/client";

import { Button } from "@/components/ui/Button";
import { ReservationHoldDock } from "@/components/bookings/ReservationHoldDock";
import { usePwa } from "@/components/pwa/PwaProvider";
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
  MANUAL_SERVICE_FEE_PERCENT,
  manualBookingServiceFeeFor,
  manualGrossFor,
  SERVICE_FEE_PERCENT,
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
const mobileBookingViewQuery = "(max-width: 639px)";

function subscribeToMobileBookingView(onChange: () => void) {
  const mediaQuery = window.matchMedia(mobileBookingViewQuery);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getMobileBookingViewSnapshot() {
  return window.matchMedia(mobileBookingViewQuery).matches;
}

function getMobileBookingViewServerSnapshot() {
  return true;
}

export function BookCourtPanel({
  hubId,
  courts,
  operatingHours,
  today,
  nowHour,
  initialAvailability,
  viewerRole,
  paymentRequired,
  paymentMode,
  initialHold = null,
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
  paymentMode: "AUTOMATIC" | "MANUAL";
  initialHold?: NonNullable<BookingFormState["hold"]> | null;
}) {
  const router = useRouter();
  const [activeCourtId, setActiveCourtId] = useState(courts[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [pickedByCourt, setPickedByCourt] = useState<Record<string, number[]>>(
    {}
  );
  const [viewOverride, setViewOverride] =
    useState<CourtAvailabilityView | null>(null);
  const [closedHoldId, setClosedHoldId] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(
    createBookingAction,
    initialHold ? { hold: initialHold } : initialState
  );
  const { isOnline } = usePwa();

  useEffect(() => {
    if (state.activeHoldConflict) router.refresh();
  }, [router, state.activeHoldConflict]);
  const mobileBookingView = useSyncExternalStore(
    subscribeToMobileBookingView,
    getMobileBookingViewSnapshot,
    getMobileBookingViewServerSnapshot
  );
  const view = viewOverride ?? (mobileBookingView ? "list" : "grid");

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
          dateBlocks: occupancy?.dateBlocks ?? [],
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
  const activeHold =
    state.hold && state.hold.paymentId !== closedHoldId ? state.hold : null;
  const heldSelectedByCourt = useMemo(() => {
    const grouped: Record<string, number[]> = {};
    for (const selection of activeHold?.selections ?? []) {
      grouped[selection.courtId] = [
        ...(grouped[selection.courtId] ?? []),
        selection.hour,
      ];
    }
    return grouped;
  }, [activeHold]);
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
  const serviceFee =
    paymentMode === "MANUAL"
      ? manualBookingServiceFeeFor(pricedTotal)
      : bookingServiceFeeFor(pricedTotal);
  const bookingSubtotal =
    paymentMode === "MANUAL"
      ? manualGrossFor(pricedTotal)
      : grossFor(pricedTotal);

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
      className={`scroll-mt-24 border-y border-gray-200 bg-white pt-14 sm:pt-16 ${
        activeHold ? "pb-52 sm:pb-44" : "pb-14 sm:pb-16"
      }`}
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
              <Fragment key={`${group.court.id}:${hour}`}>
                <input
                  type="hidden"
                  name="courtIds"
                  value={group.court.id}
                />
                <input type="hidden" name="hours" value={hour} />
              </Fragment>
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
                    href={state.managePath ?? "/dashboard/bookings"}
                    className="font-semibold underline"
                  >
                    View booking
                  </Link>
                </p>
              )}
            </div>
          )}

          <div
            className={`space-y-8 transition-opacity ${
              activeHold ? "pointer-events-none opacity-65" : ""
            }`}
            aria-disabled={activeHold ? "true" : undefined}
          >
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
                  selectedByCourt={
                    activeHold ? heldSelectedByCourt : selectedByCourt
                  }
                  view={view}
                  onViewChange={setViewOverride}
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

            {activeHold ? (
              <div className="mt-6 flex flex-col gap-3 text-sm">
                <div className="rounded-xl border border-primary/20 bg-white/70 px-4 py-3">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-primary">
                    <span className="flex size-6 items-center justify-center rounded-lg bg-primary-soft">
                      ✓
                    </span>
                    Slots reserved
                  </p>
                  <p className="mt-2 font-semibold text-navy">
                    {formatManilaDateLong(activeHold.date)}
                  </p>
                </div>
                {activeHold.lines.map((line) => (
                  <div
                    key={line.bookingId}
                    className="rounded-xl bg-white/55 px-3 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-extrabold text-navy">
                        {line.courtName}
                      </p>
                      <p className="shrink-0 text-xs font-semibold text-navy">
                        {line.hours} {line.hours === 1 ? "hr" : "hrs"}
                      </p>
                    </div>
                    <p className="mt-1.5 text-xs text-navy/70">
                      {formatHourLabel(line.startHour)} –{" "}
                      {formatHourLabel(line.endHour)}
                    </p>
                  </div>
                ))}
                <div className="mt-2 flex items-end justify-between gap-3 border-t border-navy/10 pt-4">
                  <span className="font-bold text-navy">Total to pay</span>
                  <span className="shrink-0 text-2xl font-extrabold text-navy">
                    {formatPHP(activeHold.amount)}
                  </span>
                </div>
              </div>
            ) : selectedGroups.length > 0 ? (
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
                      <span>
                        Service fee ({paymentMode === "MANUAL"
                          ? MANUAL_SERVICE_FEE_PERCENT
                          : SERVICE_FEE_PERCENT}
                        %, non-refundable)
                      </span>
                      <span className="shrink-0 font-semibold text-navy">
                        {formatPHP(serviceFee)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-end justify-between gap-3 border-t border-navy/10 pt-4">
                    <span className="font-bold text-navy">
                      {requiresOnlinePayment ? "Booking subtotal" : "Total"}
                    </span>
                    <span className="shrink-0 text-2xl font-extrabold text-navy">
                      {formatPHP(
                        requiresOnlinePayment ? bookingSubtotal : pricedTotal
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

            {viewerRole === null && !activeHold && (
              <div className="mt-6 border-t border-navy/10 pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-navy/50">
                      Guest details
                    </p>
                    <p className="mt-1 text-xs leading-5 text-navy/55">
                      No account required. We&apos;ll email payment and booking updates.
                    </p>
                  </div>
                  <Link href="/login" className="shrink-0 text-xs font-bold text-primary hover:underline">
                    Sign in
                  </Link>
                </div>
                <div className="mt-4 grid gap-3">
                  <label className="text-xs font-bold text-navy">
                    Full name
                    <input
                      name="guestName"
                      autoComplete="name"
                      maxLength={100}
                      required
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm font-medium text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      placeholder="Your full name"
                    />
                    {state.errors?.guestName && <span className="mt-1 block font-medium text-red-500">{state.errors.guestName}</span>}
                  </label>
                  <label className="text-xs font-bold text-navy">
                    Phone
                    <input
                      name="guestPhone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={30}
                      required
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm font-medium text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      placeholder="09XX XXX XXXX"
                    />
                    {state.errors?.guestPhone && <span className="mt-1 block font-medium text-red-500">{state.errors.guestPhone}</span>}
                  </label>
                  <label className="text-xs font-bold text-navy">
                    Email
                    <input
                      name="guestEmail"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      className="mt-1.5 min-h-11 w-full rounded-xl border border-navy/15 bg-white px-3 text-sm font-medium text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
                      placeholder="you@example.com"
                    />
                    {state.errors?.guestEmail && <span className="mt-1 block font-medium text-red-500">{state.errors.guestEmail}</span>}
                  </label>
                </div>
                <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-navy/50">
                  <LockIcon />
                  Your private booking link is sent only to this email. Providing these details does not create an account.
                </p>
              </div>
            )}

            <div className="mt-6 flex flex-col gap-4">
              {viewerRole !== null && viewerRole !== "PLAYER" ? (
                <p className="rounded-xl bg-white/60 px-4 py-3 text-sm text-navy/65">
                  Bookings are for player accounts.
                </p>
              ) : activeHold ? (
                <div className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary-soft px-4 text-sm font-bold text-primary">
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect width="16" height="12" x="4" y="10" rx="2" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                  </svg>
                  Complete payment below
                </div>
              ) : (
                <Button
                  type="submit"
                  className="min-h-12 rounded-xl"
                  disabled={selectedCount === 0 || pending || !isOnline}
                >
                  {!isOnline
                    ? "Reconnect to book"
                    : pending
                    ? requiresOnlinePayment
                      ? paymentMode === "MANUAL"
                        ? "Preparing payment…"
                        : "Preparing QR Ph…"
                      : "Booking…"
                    : selectedCount === 0
                      ? "Pick your hours"
                      : requiresOnlinePayment
                        ? "Confirm & Pay"
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
                    ? paymentMode === "MANUAL"
                      ? `Confirm your selection, transfer the exact venue amount, and upload a receipt within ${BOOKING_HOLD_MINUTES} minutes. The venue confirms after review.`
                      : `Confirm your selection and pay with QR Ph. We'll hold your hours for ${BOOKING_HOLD_MINUTES} minutes while you complete PayMongo's secure checkout.`
                    : "No payment needed — confirm here and settle at the venue."}
                </p>
              </div>
            </div>
          </aside>
        </form>
        {activeHold && (
          <ReservationHoldDock
            hold={activeHold}
            onClosed={() => setClosedHoldId(activeHold.paymentId)}
          />
        )}
      </div>
    </section>
  );
}

function LockIcon() {
  return (
    <svg className="mt-0.5 shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect width="16" height="12" x="4" y="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
