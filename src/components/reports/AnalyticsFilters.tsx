"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import type {
  AnalyticsFilterOptions,
  AnalyticsOption,
  BusinessAnalyticsFilters,
} from "@/lib/business-analytics";
import { GAME_LABELS } from "@/lib/constants";

const control =
  "min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-navy outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

type SearchKind = "partner" | "hub" | "court";

function SearchableAnalyticsSelect({
  kind,
  label,
  name,
  placeholder,
  selected,
  partnerId,
  hubId,
  onChange,
}: {
  kind: SearchKind;
  label: string;
  name: string;
  placeholder: string;
  selected: AnalyticsOption | null;
  partnerId?: string;
  hubId?: string;
  onChange: (option: AnalyticsOption | null) => void;
}) {
  const listboxId = useId();
  const requestNumber = useRef(0);
  const [text, setText] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<AnalyticsOption[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!open) return;
    const currentRequest = ++requestNumber.current;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams({ kind });
      if (text.trim()) query.set("q", text.trim());
      if (partnerId) query.set("partnerId", partnerId);
      if (hubId) query.set("hubId", hubId);
      try {
        const response = await fetch(`/api/analytics/options?${query}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Option search failed");
        const body = (await response.json()) as {
          items: AnalyticsOption[];
          hasMore: boolean;
        };
        if (currentRequest !== requestNumber.current) return;
        setItems(body.items);
        setHasMore(body.hasMore);
        setActiveIndex(body.items.length > 0 ? 0 : -1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setItems([]);
          setHasMore(false);
          setActiveIndex(-1);
        }
      } finally {
        if (currentRequest === requestNumber.current) setLoading(false);
      }
    }, 220);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [hubId, kind, open, partnerId, text]);

  function choose(option: AnalyticsOption) {
    onChange(option);
    setText(option.name);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) =>
        items.length === 0 ? -1 : Math.min(index + 1, items.length - 1)
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      const option = items[activeIndex];
      if (option) choose(option);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <label className="relative block min-w-[180px] flex-1 lg:max-w-[240px]">
      <span className="mb-1 block text-[11px] font-bold text-slate-500">
        {label}
      </span>
      <input type="hidden" name={name} value={selected?.id ?? ""} />
      <div className="relative">
        <input
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={
            open && activeIndex >= 0
              ? `${listboxId}-${activeIndex}`
              : undefined
          }
          autoComplete="off"
          className={`${control} w-full pr-9`}
          placeholder={placeholder}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (selected) onChange(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {text ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-navy"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setText("");
              onChange(null);
              setOpen(true);
            }}
          >
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl shadow-navy/10"
          onMouseDown={(event) => event.preventDefault()}
        >
          {loading ? (
            <p className="px-3 py-3 text-xs text-slate-500">Searching…</p>
          ) : items.length > 0 ? (
            <>
              {items.map((option, index) => (
                <button
                  id={`${listboxId}-${index}`}
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={selected?.id === option.id}
                  className={`block w-full rounded-lg px-3 py-2 text-left transition ${
                    index === activeIndex
                      ? "bg-primary-soft"
                      : "hover:bg-slate-50"
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => choose(option)}
                >
                  <span className="block text-sm font-bold text-navy">
                    {option.name}
                  </span>
                  {option.description ? (
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {option.description}
                    </span>
                  ) : null}
                </button>
              ))}
              {hasMore ? (
                <p className="px-3 py-2 text-[11px] text-slate-500">
                  Keep typing to narrow the results.
                </p>
              ) : null}
            </>
          ) : (
            <p className="px-3 py-3 text-xs text-slate-500">
              No matching {label.toLowerCase()} found.
            </p>
          )}
        </div>
      ) : null}
    </label>
  );
}

export function AnalyticsFilters({
  action,
  audience,
  filters,
  options,
}: {
  action: string;
  audience: "partner" | "owner";
  filters: BusinessAnalyticsFilters;
  options: AnalyticsFilterOptions;
}) {
  const exportQuery = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    compare: filters.compare ? "1" : "0",
    source: filters.source,
    mode: filters.mode,
  });
  if (filters.partnerId) exportQuery.set("partner", filters.partnerId);
  if (filters.hubId) exportQuery.set("hub", filters.hubId);
  if (filters.courtId) exportQuery.set("court", filters.courtId);
  if (filters.sport) exportQuery.set("sport", filters.sport);
  exportQuery.set("audience", audience);
  const [showMore, setShowMore] = useState(
    Boolean(
      filters.sport ||
        filters.source !== "all" ||
        filters.mode !== "all" ||
        !filters.compare
    )
  );
  const [partner, setPartner] = useState<AnalyticsOption | null>(
    options.partners.find((item) => item.id === filters.partnerId) ?? null
  );
  const [hub, setHub] = useState<AnalyticsOption | null>(
    options.hubs.find((item) => item.id === filters.hubId) ?? null
  );
  const [court, setCourt] = useState<AnalyticsOption | null>(
    options.courts.find((item) => item.id === filters.courtId) ?? null
  );
  const [partnerHubId, setPartnerHubId] = useState(filters.hubId ?? "");
  const [partnerCourtId, setPartnerCourtId] = useState(filters.courtId ?? "");
  const partnerCourts = options.courts.filter(
    (item) => !partnerHubId || item.hubId === partnerHubId
  );
  const activeLabels = [
    partner ? `Partner: ${partner.name}` : null,
    hub ? `Hub: ${hub.name}` : null,
    audience === "partner" && partnerHubId
      ? `Hub: ${options.hubs.find((item) => item.id === partnerHubId)?.name ?? "Selected"}`
      : null,
    court ? `Court: ${court.name}` : null,
    audience === "partner" && partnerCourtId
      ? `Court: ${options.courts.find((item) => item.id === partnerCourtId)?.name ?? "Selected"}`
      : null,
    filters.sport
      ? `Sport: ${GAME_LABELS[filters.sport] ?? filters.sport}`
      : null,
    filters.source !== "all" ? `Source: ${filters.source}` : null,
    filters.mode !== "all" ? `Mode: ${filters.mode.toLowerCase()}` : null,
    !filters.compare ? "No comparison" : null,
  ].filter((label): label is string => Boolean(label));

  return (
    <section className="rounded-2xl border border-[#dfe7e2] bg-white p-3 shadow-sm shadow-navy/5">
      <form action={action} method="get">
        <div className="flex flex-wrap items-end gap-2">
          <fieldset className="min-w-[280px] flex-[1.4]">
            <legend className="mb-1 text-[11px] font-bold text-slate-500">
              Date range
            </legend>
            <div className="flex items-center gap-2">
              <label className="min-w-0 flex-1">
                <span className="sr-only">From</span>
                <input
                  className={`${control} w-full`}
                  type="date"
                  name="from"
                  defaultValue={filters.from}
                  aria-label="From date"
                />
              </label>
              <span aria-hidden="true" className="text-xs text-slate-400">
                to
              </span>
              <label className="min-w-0 flex-1">
                <span className="sr-only">To</span>
                <input
                  className={`${control} w-full`}
                  type="date"
                  name="to"
                  defaultValue={filters.to}
                  aria-label="To date"
                />
              </label>
            </div>
          </fieldset>

          {audience === "owner" ? (
            <>
              <SearchableAnalyticsSelect
                kind="partner"
                label="Partner"
                name="partner"
                placeholder="Search partner or email"
                selected={partner}
                onChange={(option) => {
                  setPartner(option);
                  setHub(null);
                  setCourt(null);
                }}
              />
              <SearchableAnalyticsSelect
                key={`hub-${partner?.id ?? "all"}`}
                kind="hub"
                label="Hub"
                name="hub"
                placeholder="Search hubs"
                selected={hub}
                partnerId={partner?.id}
                onChange={(option) => {
                  setHub(option);
                  setCourt(null);
                }}
              />
            </>
          ) : (
            <>
              <label className="min-w-[180px] flex-1 lg:max-w-[240px]">
                <span className="mb-1 block text-[11px] font-bold text-slate-500">
                  Hub
                </span>
                <select
                  className={`${control} w-full`}
                  name="hub"
                  value={partnerHubId}
                  onChange={(event) => {
                    setPartnerHubId(event.target.value);
                    setPartnerCourtId("");
                  }}
                >
                  <option value="">All hubs</option>
                  {options.hubs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-[180px] flex-1 lg:max-w-[240px]">
                <span className="mb-1 block text-[11px] font-bold text-slate-500">
                  Court
                </span>
                <select
                  className={`${control} w-full`}
                  name="court"
                  value={partnerCourtId}
                  onChange={(event) => setPartnerCourtId(event.target.value)}
                >
                  <option value="">All courts</option>
                  {partnerCourts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <button
            type="button"
            aria-expanded={showMore}
            aria-controls="analytics-more-filters"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-600 transition hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
            onClick={() => setShowMore((value) => !value)}
          >
            More filters
            {activeLabels.length > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">
                {activeLabels.length}
              </span>
            ) : null}
            <span aria-hidden="true">{showMore ? "−" : "+"}</span>
          </button>

          <div className="ml-auto flex items-center gap-2">
            <a
              href={action}
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-3 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-navy"
            >
              Reset
            </a>
            <button
              type="submit"
              className="min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-white shadow-sm shadow-primary/20 transition hover:bg-primary-hover"
            >
              Apply
            </button>
            <a
              href={`/api/analytics/export?${exportQuery.toString()}`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-navy transition hover:border-primary/40 hover:bg-primary-soft"
            >
              Export CSV
            </a>
          </div>
        </div>

        {activeLabels.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Active filters">
            {activeLabels.map((label) => (
              <span
                key={label}
                className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}

        {showMore ? (
          <div
            id="analytics-more-filters"
            className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {audience === "owner" ? (
              <SearchableAnalyticsSelect
                key={`court-${partner?.id ?? "all"}-${hub?.id ?? "all"}`}
                kind="court"
                label="Court"
                name="court"
                placeholder="Search courts"
                selected={court}
                partnerId={partner?.id}
                hubId={hub?.id}
                onChange={setCourt}
              />
            ) : null}
            <label className="text-[11px] font-bold text-slate-500">
              Sport
              <select
                className={`${control} mt-1 w-full`}
                name="sport"
                defaultValue={filters.sport ?? ""}
              >
                <option value="">All sports</option>
                {options.sports.map((sport) => (
                  <option key={sport} value={sport}>
                    {GAME_LABELS[sport] ?? sport}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-500">
              Revenue source
              <select
                className={`${control} mt-1 w-full`}
                name="source"
                defaultValue={filters.source}
              >
                <option value="all">All revenue</option>
                <option value="court">Court bookings</option>
                <option value="event">Events</option>
                {audience === "owner" ? (
                  <option value="trainer">Trainer sessions</option>
                ) : null}
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-500">
              Payment mode
              <select
                className={`${control} mt-1 w-full`}
                name="mode"
                defaultValue={filters.mode}
              >
                <option value="all">All modes</option>
                <option value="AUTOMATIC">Automatic</option>
                <option value="MANUAL">Manual</option>
              </select>
            </label>
            <label className="text-[11px] font-bold text-slate-500">
              Comparison
              <select
                className={`${control} mt-1 w-full`}
                name="compare"
                defaultValue={filters.compare ? "1" : "0"}
              >
                <option value="1">Previous period</option>
                <option value="0">No comparison</option>
              </select>
            </label>
          </div>
        ) : null}
      </form>
    </section>
  );
}
