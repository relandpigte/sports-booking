import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { BookingStatus } from "@prisma/client";

import { getCurrentUser } from "@/lib/dal";
import {
  listMyBookings,
  listPartnerBookings,
  type PartnerBookingFilters,
  type PartnerBookingPaymentFilter,
  type PartnerBookingSection,
  type PartnerBookingSort,
} from "@/lib/bookings";
import { listMyHubs } from "@/lib/hubs";
import { BookingCard } from "@/components/bookings/BookingCard";
import { PartnerBookingListRow } from "@/components/bookings/PartnerBookingListRow";
import { PartnerBookingsView } from "@/components/bookings/PartnerBookingsView";
import { PlayerBookingsView } from "@/components/bookings/PlayerBookingsView";
import { PlayerEventRegistrationCard } from "@/components/bookings/PlayerEventRegistrationCard";
import {
  isValidDateString,
  manilaNowHour,
  manilaToday,
} from "@/lib/time";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";
import { listMyEventRegistrations } from "@/lib/events";

export const metadata: Metadata = {
  title: "Bookings — Bunal.club",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const partnerBookingStatuses: BookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "EXPIRED",
];
const partnerPaymentFilters: PartnerBookingPaymentFilter[] = [
  "paid",
  "unpaid",
  "refunded",
];
const partnerBookingSorts: PartnerBookingSort[] = [
  "soonest",
  "newest",
  "player",
  "amount",
];

function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function partnerBookingsHref(
  filters: PartnerBookingFilters,
  overrides: Partial<PartnerBookingFilters> = {}
): string {
  const values = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (values.section === "history") params.set("tab", "history");
  if (values.query) params.set("q", values.query);
  if (values.hubId) params.set("hub", values.hubId);
  if (values.courtId) params.set("court", values.courtId);
  if (values.status) params.set("status", values.status);
  if (values.payment) params.set("payment", values.payment);
  if (values.from) params.set("from", values.from);
  if (values.to) params.set("to", values.to);
  if (values.sort !== "soonest") params.set("sort", values.sort);
  if (values.page > 1) params.set("page", String(values.page));

  const query = params.toString();
  return `/dashboard/bookings${query ? `?${query}` : ""}`;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [user, impersonation] = await Promise.all([
    getCurrentUser(),
    getCurrentPartnerImpersonation(),
  ]);
  if (!user || user.role === "ADMIN") redirect("/dashboard");
  if (
    user.role === "PARTNER" &&
    user.partnerStatus !== "ACTIVE" &&
    impersonation?.partner.id !== user.id
  ) {
    redirect("/dashboard/partner");
  }

  if (user.role === "PARTNER") {
    const params = await searchParams;
    const section: PartnerBookingSection =
      firstSearchValue(params.tab) === "history" ? "history" : "upcoming";
    const query = firstSearchValue(params.q).trim().slice(0, 100);
    const hubId = firstSearchValue(params.hub);
    const courtId = firstSearchValue(params.court);
    const requestedStatus = firstSearchValue(params.status) as BookingStatus;
    const requestedPayment = firstSearchValue(
      params.payment
    ) as PartnerBookingPaymentFilter;
    const requestedSort = firstSearchValue(params.sort) as PartnerBookingSort;
    const requestedFrom = firstSearchValue(params.from);
    const requestedTo = firstSearchValue(params.to);
    const requestedPage = Number.parseInt(firstSearchValue(params.page), 10);
    const filters: PartnerBookingFilters = {
      section,
      query: query || undefined,
      hubId: hubId || undefined,
      courtId: courtId || undefined,
      status: partnerBookingStatuses.includes(requestedStatus)
        ? requestedStatus
        : undefined,
      payment: partnerPaymentFilters.includes(requestedPayment)
        ? requestedPayment
        : undefined,
      from: isValidDateString(requestedFrom) ? requestedFrom : undefined,
      to: isValidDateString(requestedTo) ? requestedTo : undefined,
      sort: partnerBookingSorts.includes(requestedSort)
        ? requestedSort
        : "soonest",
      page: Number.isFinite(requestedPage) && requestedPage > 0
        ? requestedPage
        : 1,
    };
    const [bookings, hubs] = await Promise.all([
      listPartnerBookings(filters),
      listMyHubs(),
    ]);
    const rescheduleByHub = new Map(
      hubs.map((hub) => [
        hub.id,
        {
          courts: hub.courts,
          operatingHours: hub.operatingHours,
          today: manilaToday(),
          nowHour: manilaNowHour(),
        },
      ])
    );
    const hubOptions = hubs.map((hub) => ({
      value: hub.id,
      label: hub.name,
    }));
    const courtOptions = hubs.flatMap((hub) =>
      hub.courts.map((court) => ({
        value: court.id,
        label: `${hub.name} · ${court.name}`,
      }))
    );
    const firstResult =
      bookings.total === 0
        ? 0
        : (bookings.page - 1) * bookings.pageSize + 1;
    const lastResult = Math.min(
      bookings.page * bookings.pageSize,
      bookings.total
    );

    return (
      <PartnerBookingsView
        section={bookings.section}
        upcomingCount={bookings.upcomingCount}
        historyCount={bookings.historyCount}
        resultCount={bookings.total}
        filters={{
          query,
          hubId,
          courtId,
          status: filters.status ?? "",
          payment: filters.payment ?? "",
          from: filters.from ?? "",
          to: filters.to ?? "",
          sort: filters.sort,
        }}
        hubOptions={hubOptions}
        courtOptions={courtOptions}
        upcomingHref={partnerBookingsHref(filters, {
          section: "upcoming",
          page: 1,
        })}
        historyHref={partnerBookingsHref(filters, {
          section: "history",
          page: 1,
        })}
        clearHref={partnerBookingsHref({
          section,
          sort: "soonest",
          page: 1,
        })}
        previousHref={
          bookings.page > 1
            ? partnerBookingsHref(filters, { page: bookings.page - 1 })
            : null
        }
        nextHref={
          bookings.page < bookings.pageCount
            ? partnerBookingsHref(filters, { page: bookings.page + 1 })
            : null
        }
        page={bookings.page}
        pageCount={bookings.pageCount}
        firstResult={firstResult}
        lastResult={lastResult}
        list={bookings.items.map((booking) => (
          <PartnerBookingListRow
            key={booking.id}
            booking={booking}
            cancellable={bookings.section === "upcoming"}
            reschedule={
              bookings.section === "upcoming"
                ? rescheduleByHub.get(booking.hub.id)
                : undefined
            }
          />
        ))}
        grid={bookings.items.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            view="partner"
            cancellable={bookings.section === "upcoming"}
            reschedule={
              bookings.section === "upcoming"
                ? rescheduleByHub.get(booking.hub.id)
                : undefined
            }
          />
        ))}
      />
    );
  }

  const [courtBookings, eventRegistrations] = await Promise.all([
    listMyBookings(),
    listMyEventRegistrations(),
  ]);

  return (
    <PlayerBookingsView
      upcomingCourtCount={courtBookings.upcoming.length}
      pastCourtCount={courtBookings.past.length}
      upcomingEventCount={eventRegistrations.upcoming.length}
      pastEventCount={eventRegistrations.past.length}
      upcomingCourts={courtBookings.upcoming.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          view="player"
          cancellable
        />
      ))}
      pastCourts={courtBookings.past.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          view="player"
          cancellable={false}
        />
      ))}
      upcomingEvents={eventRegistrations.upcoming.map((registration) => (
        <PlayerEventRegistrationCard
          key={registration.id}
          registration={registration}
        />
      ))}
      pastEvents={eventRegistrations.past.map((registration) => (
        <PlayerEventRegistrationCard
          key={registration.id}
          registration={registration}
        />
      ))}
    />
  );
}
