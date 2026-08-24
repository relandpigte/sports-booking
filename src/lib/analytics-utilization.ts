import type { AnalyticsUtilizationView } from "@/lib/analytics-query";
import type { UtilizationRow } from "@/lib/business-analytics";

export const HUB_UTILIZATION_PAGE_SIZE = 25;

export type HubUtilizationSummary = {
  hubId: string;
  hub: string;
  partnerId: string;
  partner: string;
  courtCount: number;
  sports: string[];
  bookedHours: number;
  availableHours: number;
  utilizationRate: number;
  estimated: boolean;
  courts: UtilizationRow[];
};

export function hubUtilizationPage(
  rows: UtilizationRow[],
  view: AnalyticsUtilizationView
) {
  const grouped = new Map<string, HubUtilizationSummary>();
  for (const row of rows) {
    const current = grouped.get(row.hubId) ?? {
      hubId: row.hubId,
      hub: row.hub,
      partnerId: row.partnerId,
      partner: row.partner,
      courtCount: 0,
      sports: [],
      bookedHours: 0,
      availableHours: 0,
      utilizationRate: 0,
      estimated: false,
      courts: [],
    };
    current.courts.push(row);
    current.courtCount += 1;
    current.bookedHours += row.bookedHours;
    current.availableHours += row.availableHours;
    current.estimated ||= row.estimated;
    if (!current.sports.includes(row.sport)) current.sports.push(row.sport);
    grouped.set(row.hubId, current);
  }

  const normalizedQuery = view.query.toLocaleLowerCase("en-PH");
  const hubs = [...grouped.values()]
    .map((hub) => ({
      ...hub,
      sports: [...hub.sports].sort((a, b) => a.localeCompare(b)),
      courts: [...hub.courts].sort((a, b) => a.court.localeCompare(b.court)),
      utilizationRate:
        hub.availableHours > 0
          ? (hub.bookedHours / hub.availableHours) * 100
          : 0,
    }))
    .filter(
      (hub) =>
        !normalizedQuery ||
        hub.hub.toLocaleLowerCase("en-PH").includes(normalizedQuery) ||
        hub.partner.toLocaleLowerCase("en-PH").includes(normalizedQuery)
    )
    .sort((a, b) => {
      if (view.sort === "name-asc") {
        return a.hub.localeCompare(b.hub) || a.partner.localeCompare(b.partner);
      }
      if (view.sort === "booked-desc") {
        return b.bookedHours - a.bookedHours || a.hub.localeCompare(b.hub);
      }
      return (
        b.utilizationRate - a.utilizationRate || a.hub.localeCompare(b.hub)
      );
    });

  const pageCount = Math.max(
    1,
    Math.ceil(hubs.length / HUB_UTILIZATION_PAGE_SIZE)
  );
  const page = Math.min(view.page, pageCount);
  const offset = (page - 1) * HUB_UTILIZATION_PAGE_SIZE;
  return {
    items: hubs.slice(offset, offset + HUB_UTILIZATION_PAGE_SIZE),
    page,
    pageCount,
    pageSize: HUB_UTILIZATION_PAGE_SIZE,
    total: hubs.length,
  };
}
