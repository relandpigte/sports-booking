import type { AnalyticsEventView } from "@/lib/analytics-query";
import type { EventPerformanceRow } from "@/lib/business-analytics";

export const EVENT_REPORT_PAGE_SIZE = 10;

export function eventPerformanceDateRange(
  rows: EventPerformanceRow[],
  fallback: { from: string; to: string }
) {
  if (rows.length === 0) return fallback;
  const dates = rows.map((row) => row.date).sort((a, b) => a.localeCompare(b));
  return {
    from: dates[0] ?? fallback.from,
    to: dates.at(-1) ?? fallback.to,
  };
}

export function eventPerformancePage(
  rows: EventPerformanceRow[],
  view: AnalyticsEventView
) {
  const query = view.query.toLocaleLowerCase("en-PH");
  const filtered = rows.filter((row) => {
    if (row.date < view.from || row.date > view.to) return false;
    if (!query) return true;
    return [
      row.title,
      row.hub,
      row.date,
      ...row.payments.flatMap((payment) => [
        payment.reference,
        payment.status,
        payment.collectionMode,
      ]),
    ].some((value) => value.toLocaleLowerCase("en-PH").includes(query));
  });
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / EVENT_REPORT_PAGE_SIZE)
  );
  const page = Math.min(view.page, pageCount);
  const offset = (page - 1) * EVENT_REPORT_PAGE_SIZE;

  return {
    items: filtered.slice(offset, offset + EVENT_REPORT_PAGE_SIZE),
    page,
    pageCount,
    pageSize: EVENT_REPORT_PAGE_SIZE,
    total: filtered.length,
  };
}
