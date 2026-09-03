import type { AnalyticsBookingFeeView } from "@/lib/analytics-query";
import type { CourtPaymentBreakdownRow } from "@/lib/business-analytics";
import { manilaDateOf } from "@/lib/time";

export const BOOKING_FEE_PAGE_SIZE = 10;

export function courtPaymentFeePage(
  rows: CourtPaymentBreakdownRow[],
  view: AnalyticsBookingFeeView
) {
  const query = view.query.toLocaleLowerCase("en-PH");
  const filtered = rows.filter((row) => {
    const paidDate = manilaDateOf(new Date(row.paidAt));
    if (paidDate < view.from || paidDate > view.to) return false;
    if (!query) return true;
    return [
      row.reference,
      row.paymentId,
      row.partner,
      row.hub,
      row.status,
      row.collectionMode,
      ...row.bookings.flatMap((booking) => [booking.court, booking.date]),
    ].some((value) => value.toLocaleLowerCase("en-PH").includes(query));
  });
  const pageCount = Math.max(
    1,
    Math.ceil(filtered.length / BOOKING_FEE_PAGE_SIZE)
  );
  const page = Math.min(view.page, pageCount);
  const offset = (page - 1) * BOOKING_FEE_PAGE_SIZE;

  return {
    items: filtered.slice(offset, offset + BOOKING_FEE_PAGE_SIZE),
    page,
    pageCount,
    pageSize: BOOKING_FEE_PAGE_SIZE,
    total: filtered.length,
  };
}
