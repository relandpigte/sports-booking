import Link from "next/link";
import type { TrainerSessionStatus } from "@prisma/client";

import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { AdminTrainerBookingPage } from "@/lib/admin-trainer-bookings";
import { formatPHP } from "@/lib/currency";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

const statusOptions: Array<{
  value: TrainerSessionStatus;
  label: string;
}> = [
  { value: "REQUESTED", label: "Requested" },
  { value: "AWAITING_PAYMENT", label: "Awaiting payment" },
  { value: "PAYMENT_REVIEW", label: "Payment review" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "DECLINED", label: "Declined" },
  { value: "EXPIRED", label: "Expired" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "REFUNDED", label: "Refunded" },
];

const statusTones: Partial<Record<TrainerSessionStatus, BadgeTone>> = {
  REQUESTED: "warn",
  AWAITING_PAYMENT: "warn",
  PAYMENT_REVIEW: "warn",
  CONFIRMED: "success",
  DECLINED: "danger",
  CANCELLED: "danger",
};

function bookingHref(
  filters: {
    query: string;
    status?: TrainerSessionStatus;
    from: string;
    to: string;
  },
  page: number
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.status) params.set("status", filters.status.toLowerCase());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/dashboard/admin/trainer-bookings${query ? `?${query}` : ""}`;
}

export function AdminTrainerBookings({
  result,
  query,
  status,
  from,
  to,
}: {
  result: AdminTrainerBookingPage;
  query: string;
  status?: TrainerSessionStatus;
  from: string;
  to: string;
}) {
  const filters = { query, status, from, to };

  return (
    <section className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <form
          action="/dashboard/admin/trainer-bookings"
          className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_auto_auto_auto_auto]"
        >
          <label className="sr-only" htmlFor="trainer-booking-search">
            Search trainer bookings
          </label>
          <input
            id="trainer-booking-search"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Booking, trainer, player, or email"
            className="min-h-11 min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-navy outline-none placeholder:text-slate-400 focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <label className="sr-only" htmlFor="trainer-booking-status">
            Filter by status
          </label>
          <select
            id="trainer-booking-status"
            name="status"
            defaultValue={status ?? ""}
            className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="trainer-booking-from">
            From date
          </label>
          <input
            id="trainer-booking-from"
            name="from"
            type="date"
            defaultValue={from}
            className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <label className="sr-only" htmlFor="trainer-booking-to">
            To date
          </label>
          <input
            id="trainer-booking-to"
            name="to"
            type="date"
            defaultValue={to}
            className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-navy outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            className="min-h-11 rounded-xl bg-primary px-4 text-xs font-black text-white hover:bg-primary/90"
          >
            Apply
          </button>
        </form>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            {result.total.toLocaleString()} {result.total === 1 ? "booking" : "bookings"}
          </span>
          {query || status || from || to ? (
            <Link
              href="/dashboard/admin/trainer-bookings"
              className="font-bold text-primary hover:underline"
            >
              Clear filters
            </Link>
          ) : null}
        </div>
      </div>

      {result.items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-5 py-3" scope="col">Booking</th>
                <th className="px-3 py-3" scope="col">Trainer</th>
                <th className="px-3 py-3" scope="col">Player</th>
                <th className="px-3 py-3" scope="col">Schedule</th>
                <th className="px-3 py-3" scope="col">Status</th>
                <th className="px-3 py-3" scope="col">Payment</th>
                <th className="px-5 py-3 text-right" scope="col">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.items.map((booking) => (
                <tr key={booking.id} className="align-top hover:bg-slate-50/70">
                  <td className="px-5 py-3">
                    <p className="max-w-44 truncate font-mono font-semibold text-navy" title={booking.publicId}>
                      {booking.publicId}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {booking.hours} {booking.hours === 1 ? "hour" : "hours"}
                    </p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-navy">{booking.trainer}</p>
                    <p className="mt-0.5 max-w-48 truncate text-[11px] text-slate-500">{booking.trainerEmail}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-semibold text-navy">{booking.player}</p>
                    <p className="mt-0.5 max-w-48 truncate text-[11px] text-slate-500">{booking.playerEmail}</p>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    <p className="font-semibold text-navy">{formatManilaDateLong(booking.date)}</p>
                    <p className="mt-0.5 text-[11px]">{formatSlotRange(booking.startHour, booking.endHour)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={statusTones[booking.status] ?? "neutral"}>
                      {booking.status.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-3">
                    {booking.paymentStatus ? (
                      <>
                        <p className="font-semibold text-navy">{booking.paymentStatus.toLowerCase()}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {booking.collectionMode?.toLowerCase()} · {booking.paymentMethod?.toLowerCase().replaceAll("_", " ")}
                        </p>
                        {booking.paymentReference ? (
                          <p className="mt-0.5 max-w-44 truncate font-mono text-[10px] text-slate-400" title={booking.paymentReference}>
                            {booking.paymentReference}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-slate-400">Not created</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <p className="font-black tabular-nums text-navy">{formatPHP(booking.totalAmount)}</p>
                    <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
                      Trainer {formatPHP(booking.trainerAmount)} · Fee {formatPHP(booking.platformFee)}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-10 text-center text-sm text-slate-500">
          No trainer bookings match these filters.
        </p>
      )}

      {result.pageCount > 1 ? (
        <nav aria-label="Trainer booking pages" className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-xs">
          <span className="text-slate-500">Page {result.page} of {result.pageCount}</span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link href={bookingHref(filters, result.page - 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-navy hover:bg-slate-50">
                Previous
              </Link>
            ) : null}
            {result.page < result.pageCount ? (
              <Link href={bookingHref(filters, result.page + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-navy hover:bg-slate-50">
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </section>
  );
}
