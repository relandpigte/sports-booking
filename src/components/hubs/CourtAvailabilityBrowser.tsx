"use client";

import type { Slot } from "@/lib/slots";
import { formatPHP } from "@/lib/currency";

export type CourtAvailabilityView = "list" | "grid";

export type BrowserCourt = {
  id: string;
  name: string;
  courtType: string;
  slots: Slot[];
};

export function CourtAvailabilityBrowser({
  courts,
  activeCourtId,
  selectedByCourt,
  view,
  onViewChange,
  onSelectCourt,
  onToggle,
  loading,
  live,
}: {
  courts: BrowserCourt[];
  activeCourtId: string;
  selectedByCourt: Readonly<Record<string, number[]>>;
  view: CourtAvailabilityView;
  onViewChange: (view: CourtAvailabilityView) => void;
  onSelectCourt: (courtId: string) => void;
  onToggle: (courtId: string, hour: number) => void;
  loading: boolean;
  live: boolean;
}) {
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">
            Choose court &amp; time
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Select any available hours across one or more courts.
          </p>
        </div>
        <div
          className="inline-flex w-fit rounded-xl bg-navy-soft p-1"
          role="group"
          aria-label="Availability view"
        >
          <ViewButton
            active={view === "list"}
            onClick={() => onViewChange("list")}
            icon={<ListIcon />}
          >
            Court list
          </ViewButton>
          <ViewButton
            active={view === "grid"}
            onClick={() => onViewChange("grid")}
            icon={<GridIcon />}
          >
            Compare grid
          </ViewButton>
        </div>
      </div>

      <AvailabilityLegend live={live} />

      {loading ? (
        <AvailabilitySkeleton view={view} />
      ) : view === "list" ? (
        <CourtList
          courts={courts}
          activeCourtId={activeCourtId}
          selectedByCourt={selectedByCourt}
          onSelectCourt={onSelectCourt}
          onToggle={onToggle}
        />
      ) : (
        <CourtComparisonGrid
          courts={courts}
          activeCourtId={activeCourtId}
          selectedByCourt={selectedByCourt}
          onSelectCourt={onSelectCourt}
          onToggle={onToggle}
        />
      )}
    </div>
  );
}

function CourtList({
  courts,
  activeCourtId,
  selectedByCourt,
  onSelectCourt,
  onToggle,
}: {
  courts: BrowserCourt[];
  activeCourtId: string;
  selectedByCourt: Readonly<Record<string, number[]>>;
  onSelectCourt: (courtId: string) => void;
  onToggle: (courtId: string, hour: number) => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      {courts.map((court) => {
        const active = court.id === activeCourtId;
        const availableCount = court.slots.filter((slot) => slot.available).length;
        return (
          <section
            key={court.id}
            className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
              active ? "border-primary/50 ring-1 ring-primary/15" : "border-gray-200"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelectCourt(court.id)}
              className="flex min-h-16 w-full items-center justify-between gap-4 bg-gray-50/70 px-4 py-3 text-left sm:px-5"
              aria-pressed={active}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-extrabold text-navy sm:text-base">
                  {court.name}
                </span>
                <span className="mt-1 block">
                  <CourtTypeBadge courtType={court.courtType} />
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  availableCount > 0
                    ? "bg-primary-soft text-primary"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {availableCount} open
              </span>
            </button>
            {court.slots.length > 0 ? (
              <div
                className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3"
                role="group"
                aria-label={`${court.name} time slots`}
              >
                {court.slots.map((slot) => (
                  <SlotCell
                    key={slot.hour}
                    court={court}
                    slot={slot}
                    selected={selectedByCourt[court.id]?.includes(slot.hour) ?? false}
                    showTime
                    onToggle={onToggle}
                  />
                ))}
              </div>
            ) : (
              <p className="px-5 py-6 text-sm text-gray-500">
                No time slots available for this court on this date.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CourtComparisonGrid({
  courts,
  activeCourtId,
  selectedByCourt,
  onSelectCourt,
  onToggle,
}: {
  courts: BrowserCourt[];
  activeCourtId: string;
  selectedByCourt: Readonly<Record<string, number[]>>;
  onSelectCourt: (courtId: string) => void;
  onToggle: (courtId: string, hour: number) => void;
}) {
  const hours = [
    ...new Set(courts.flatMap((court) => court.slots.map((slot) => slot.hour))),
  ].sort((left, right) => left - right);

  if (hours.length === 0) {
    return (
      <p className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-6 text-sm text-gray-500">
        No time slots are available across these courts on this date.
      </p>
    );
  }

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-40 border-b border-r border-gray-200 bg-gray-50 px-4 py-4 text-left text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
                Time
              </th>
              {courts.map((court) => {
                const active = court.id === activeCourtId;
                return (
                  <th
                    key={court.id}
                    className={`min-w-40 border-b border-r border-gray-200 px-3 py-3 text-center last:border-r-0 ${
                      active ? "bg-primary-soft/70" : "bg-gray-50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCourt(court.id)}
                      className="min-h-11 w-full rounded-lg px-2 py-1"
                      aria-pressed={active}
                    >
                      <span className="block truncate text-sm font-extrabold text-navy">
                        {court.name}
                      </span>
                      <span className="mt-1 inline-flex">
                        <CourtTypeBadge courtType={court.courtType} />
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {hours.map((hour) => {
              const label = courts
                .flatMap((court) => court.slots)
                .find((slot) => slot.hour === hour)?.label;
              return (
                <tr key={hour}>
                  <th className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-4 py-3 text-left text-xs font-bold text-navy last:border-b-0">
                    {label}
                  </th>
                  {courts.map((court) => {
                    const slot = court.slots.find((item) => item.hour === hour);
                    return (
                      <td
                        key={court.id}
                        className="border-b border-r border-gray-100 p-1.5 last:border-r-0"
                      >
                        {slot ? (
                          <SlotCell
                            court={court}
                            slot={slot}
                            selected={
                              selectedByCourt[court.id]?.includes(slot.hour) ??
                              false
                            }
                            onToggle={onToggle}
                          />
                        ) : (
                          <span className="flex min-h-14 items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-300">
                            —
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:hidden">
        Swipe sideways to compare every court.
      </p>
    </div>
  );
}

function SlotCell({
  court,
  slot,
  selected,
  showTime = false,
  onToggle,
}: {
  court: BrowserCourt;
  slot: Slot;
  selected: boolean;
  showTime?: boolean;
  onToggle: (courtId: string, hour: number) => void;
}) {
  const openPlay = slot.reason === "openPlay";
  const status = slotStatus(slot, selected);
  const title = slotTitle(slot);

  return (
    <button
      type="button"
      disabled={!slot.available}
      aria-pressed={selected}
      aria-label={`${court.name}, ${slot.label}, ${status}`}
      title={title}
      onClick={() => onToggle(court.id, slot.hour)}
      className={`min-h-14 w-full rounded-xl border-2 px-2 py-2 text-xs font-bold transition-all ${slotClasses(
        slot,
        selected
      )}`}
    >
      {showTime && <span className="block text-[11px]">{slot.label}</span>}
      <span className={`block ${showTime ? "mt-0.5" : ""}`}>{status}</span>
      {slot.available && slot.hourlyRate != null ? (
        <span
          className={`mt-0.5 block text-[10px] font-semibold ${
            selected ? "text-white/80" : "text-gray-400"
          }`}
        >
          {formatPHP(slot.hourlyRate)}
        </span>
      ) : openPlay ? (
        <span className="mt-0.5 block text-[10px] font-semibold text-ocean/75">
          Event time
        </span>
      ) : slot.reason === "closed" && slot.closureReason ? (
        <span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-400">
          {slot.closureReason}
        </span>
      ) : null}
    </button>
  );
}

function slotStatus(slot: Slot, selected: boolean) {
  if (selected) return "Selected";
  switch (slot.reason) {
    case "openPlay":
      return "Open play";
    case "booked":
      return "Booked";
    case "closed":
      return "Closed";
    case "past":
      return "Started";
    default:
      return "Available";
  }
}

function slotTitle(slot: Slot) {
  switch (slot.reason) {
    case "openPlay":
      return "Reserved for an Open Play event";
    case "booked":
      return "Already booked";
    case "closed":
      return slot.closureReason
        ? `Closed: ${slot.closureReason}`
        : "Closed by the venue";
    case "past":
      return "This time has already started";
    default:
      return undefined;
  }
}

function slotClasses(slot: Slot, selected: boolean) {
  if (selected) {
    return "border-primary bg-primary text-white shadow-md shadow-primary/15";
  }
  switch (slot.reason) {
    case "openPlay":
      return "cursor-not-allowed border-ocean/25 bg-ocean-soft text-ocean";
    case "booked":
      return "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400";
    case "closed":
      return "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400";
    case "past":
      return "cursor-not-allowed border-gray-100 bg-white text-gray-300";
    default:
      return "border-gray-200 bg-white text-navy hover:border-primary hover:text-primary";
  }
}

function AvailabilityLegend({ live }: { live: boolean }) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-gray-500">
        <LegendSwatch className="border border-gray-300 bg-white" label="Available" />
        <LegendSwatch className="bg-primary" label="Selected" />
        <LegendSwatch className="bg-gray-200" label="Booked" />
        <LegendSwatch className="border border-gray-200 bg-gray-50" label="Closed" />
        <LegendSwatch
          className="border border-ocean/25 bg-ocean-soft"
          label="Open play"
        />
        <LegendSwatch className="border border-gray-100 bg-white" label="Started" />
        <span className="inline-flex items-center gap-1.5">
          <CourtTypeBadge courtType="covered" />
          <CourtTypeBadge courtType="open" />
        </span>
        {live && (
          <span className="inline-flex items-center gap-1.5 font-medium text-green-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            Live availability
          </span>
        )}
      </div>
    </div>
  );
}

function LegendSwatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${className}`} />
      {label}
    </span>
  );
}

function CourtTypeBadge({ courtType }: { courtType: string }) {
  const indoor = courtType === "covered";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${
        indoor ? "bg-navy-soft text-navy/70" : "bg-accent-soft text-primary"
      }`}
    >
      {indoor ? <IndoorIcon /> : <OutdoorIcon />}
      {indoor ? "Indoor" : "Outdoor"}
    </span>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors sm:px-4 ${
        active ? "bg-white text-navy shadow-sm" : "text-gray-500 hover:text-navy"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function AvailabilitySkeleton({ view }: { view: CourtAvailabilityView }) {
  return (
    <div
      className={`mt-5 grid gap-2 rounded-2xl border border-gray-200 p-4 ${
        view === "grid" ? "grid-cols-3" : "grid-cols-2"
      }`}
      aria-label="Loading live court availability"
    >
      {Array.from({ length: view === "grid" ? 12 : 8 }, (_, index) => (
        <span
          key={index}
          className="h-14 animate-pulse rounded-xl bg-gray-100"
        />
      ))}
    </div>
  );
}

function ListIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IndoorIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 21h18M5 21V9l7-5 7 5v12" />
    </svg>
  );
}

function OutdoorIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  );
}
