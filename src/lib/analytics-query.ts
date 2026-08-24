import {
  defaultAnalyticsFilters,
  type AnalyticsFilterOptions,
  type AnalyticsMode,
  type AnalyticsSource,
  type BusinessAnalyticsFilters,
} from "@/lib/business-analytics";
import { addDays, isValidDateString } from "@/lib/time";

export type AnalyticsQuery = Record<
  string,
  string | string[] | undefined
>;

export type UtilizationSort =
  | "utilization-desc"
  | "booked-desc"
  | "name-asc";

export type AnalyticsUtilizationView = {
  page: number;
  query: string;
  sort: UtilizationSort;
  expandedHubId?: string;
};

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(-1) : value;
}

export function rawAnalyticsSelection(query: AnalyticsQuery) {
  return {
    partnerId: single(query.partner),
    hubId: single(query.hub),
    courtId: single(query.court),
  };
}

export function parseAnalyticsUtilizationView(
  query: AnalyticsQuery
): AnalyticsUtilizationView {
  const rawPage = Number(single(query.utilizationPage));
  const rawSort = single(query.utilizationSort);
  const allowedSorts: UtilizationSort[] = [
    "utilization-desc",
    "booked-desc",
    "name-asc",
  ];
  return {
    page:
      Number.isSafeInteger(rawPage) && rawPage > 0
        ? Math.min(rawPage, 100_000)
        : 1,
    query: (single(query.utilizationQuery) ?? "").trim().slice(0, 100),
    sort: allowedSorts.includes(rawSort as UtilizationSort)
      ? (rawSort as UtilizationSort)
      : "utilization-desc",
    expandedHubId:
      (single(query.utilizationHub) ?? "").trim().slice(0, 100) ||
      undefined,
  };
}

export function parseAnalyticsFilters(args: {
  query: AnalyticsQuery;
  audience: "partner" | "owner";
  options: AnalyticsFilterOptions;
  partnerId?: string;
}): BusinessAnalyticsFilters {
  const defaults = defaultAnalyticsFilters();
  const rawFrom = single(args.query.from);
  const rawTo = single(args.query.to);
  let from = rawFrom && isValidDateString(rawFrom) ? rawFrom : defaults.from;
  let to = rawTo && isValidDateString(rawTo) ? rawTo : defaults.to;
  if (from > to) [from, to] = [to, from];
  if (from < addDays(to, -365)) from = addDays(to, -365);

  const partner = single(args.query.partner);
  const selectedPartner =
    args.audience === "partner"
      ? args.partnerId
      : args.options.partners.some((item) => item.id === partner)
        ? partner
        : undefined;
  const hub = single(args.query.hub);
  const selectedHub = args.options.hubs.some(
    (item) =>
      item.id === hub &&
      (!selectedPartner || item.partnerId === selectedPartner)
  )
    ? hub
    : undefined;
  const court = single(args.query.court);
  const selectedCourt = args.options.courts.some(
    (item) => item.id === court && (!selectedHub || item.hubId === selectedHub)
  )
    ? court
    : undefined;
  const sport = single(args.query.sport);
  const selectedSport = args.options.sports.includes(sport ?? "")
    ? sport
    : undefined;
  const rawSource = single(args.query.source);
  const allowedSources: AnalyticsSource[] =
    args.audience === "owner"
      ? ["all", "court", "event", "trainer"]
      : ["all", "court", "event"];
  const source = allowedSources.includes(rawSource as AnalyticsSource)
    ? (rawSource as AnalyticsSource)
    : "all";
  const rawMode = single(args.query.mode);
  const mode: AnalyticsMode = ["all", "AUTOMATIC", "MANUAL"].includes(
    rawMode ?? ""
  )
    ? (rawMode as AnalyticsMode)
    : "all";

  return {
    from,
    to,
    compare: single(args.query.compare) !== "0",
    partnerId: selectedPartner,
    hubId: selectedHub,
    courtId: selectedCourt,
    sport: selectedSport,
    source,
    mode,
  };
}

export function analyticsSearchParams(filters: BusinessAnalyticsFilters) {
  const query = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    compare: filters.compare ? "1" : "0",
    source: filters.source,
    mode: filters.mode,
  });
  if (filters.partnerId) query.set("partner", filters.partnerId);
  if (filters.hubId) query.set("hub", filters.hubId);
  if (filters.courtId) query.set("court", filters.courtId);
  if (filters.sport) query.set("sport", filters.sport);
  return query;
}
