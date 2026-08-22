import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { BookingStatus } from "@prisma/client";

import { getCurrentUser } from "@/lib/dal";
import {
  listMyBookings,
  listPartnerBookings,
  type BookingView,
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
import { PlayerTrainerSessionCard } from "@/components/trainers/PlayerTrainerSessionCard";
import {
  isValidDateString,
  manilaNowHour,
  manilaToday,
} from "@/lib/time";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";
import {
  listMyEventRegistrations,
  type PlayerEventRegistrationView,
} from "@/lib/events";
import { getPartnerWorkspace, hasStaffAccess } from "@/lib/staffing";
import { prisma } from "@/lib/db";

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

type PlayerBookingSection = "upcoming" | "history";
type PlayerBookingType = "all" | "courts" | "events" | "trainers";
type PlayerBookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "WAITLISTED"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED";

type PlayerBookingFilters = {
  section: PlayerBookingSection;
  query?: string;
  type: PlayerBookingType;
  status?: PlayerBookingStatus;
  from?: string;
  to?: string;
};

const playerBookingTypes: PlayerBookingType[] = ["all", "courts", "events", "trainers"];
const playerBookingStatuses: PlayerBookingStatus[] = [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
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

function playerBookingsHref(
  filters: PlayerBookingFilters,
  overrides: Partial<PlayerBookingFilters> = {}
): string {
  const values = { ...filters, ...overrides };
  const params = new URLSearchParams();

  if (values.section === "history") params.set("tab", "history");
  if (values.query) params.set("q", values.query);
  if (values.type !== "all") params.set("type", values.type);
  if (values.status) params.set("status", values.status);
  if (values.from) params.set("from", values.from);
  if (values.to) params.set("to", values.to);

  const query = params.toString();
  return `/dashboard/bookings${query ? `?${query}` : ""}`;
}

function matchesPlayerQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase("en-PH");
  return values.some((value) =>
    value?.toLocaleLowerCase("en-PH").includes(normalized)
  );
}

function matchesPlayerDate(date: string, from?: string, to?: string) {
  return (!from || date >= from) && (!to || date <= to);
}

function filterPlayerCourtBookings(
  bookings: BookingView[],
  filters: PlayerBookingFilters
) {
  return bookings.filter((booking) => {
    const statusMatches = !filters.status
      ? true
      : filters.status === "REFUNDED"
        ? booking.payment?.status === "REFUNDED"
        : booking.status === filters.status;
    return (
      statusMatches &&
      matchesPlayerDate(booking.date, filters.from, filters.to) &&
      matchesPlayerQuery(
        [
          booking.id,
          booking.payment?.id,
          booking.payment?.manualPaymentRef,
          booking.hub.name,
          booking.hub.address,
          booking.court.name,
        ],
        filters.query ?? ""
      )
    );
  });
}

function filterPlayerEventRegistrations(
  registrations: PlayerEventRegistrationView[],
  filters: PlayerBookingFilters
) {
  return registrations.filter((registration) => {
    const statusMatches = !filters.status
      ? true
      : filters.status === "REFUNDED"
        ? registration.payment?.status === "REFUNDED"
        : registration.status === filters.status;
    return (
      statusMatches &&
      matchesPlayerDate(registration.event.date, filters.from, filters.to) &&
      matchesPlayerQuery(
        [
          registration.id,
          registration.payment?.id,
          registration.event.publicId,
          registration.event.title,
          registration.event.hub.name,
          registration.event.sport,
          ...registration.event.courts.map((court) => court.name),
        ],
        filters.query ?? ""
      )
    );
  });
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const [user, impersonation, workspace] = await Promise.all([
    getCurrentUser(),
    getCurrentPartnerImpersonation(),
    getPartnerWorkspace(),
  ]);
  if (!user || user.role === "ADMIN") redirect("/dashboard");
  if (
    user.role === "PARTNER" &&
    user.partnerStatus !== "ACTIVE" &&
    impersonation?.partner.id !== user.id
  ) {
    redirect("/dashboard/partner");
  }
  if (workspace && !hasStaffAccess(workspace, "bookings", "VIEW")) {
    redirect("/dashboard/partner?access=denied");
  }
  const params = await searchParams;

  if (workspace) {
    const canManage = hasStaffAccess(workspace, "bookings", "MANAGE");
    const canMessage = hasStaffAccess(workspace, "messages", "VIEW");
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
      listPartnerBookings(filters, workspace.partnerId),
      listMyHubs(workspace.partnerId),
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
            cancellable={canManage && bookings.section === "upcoming"}
            manageable={canManage}
            canMessage={canMessage}
            reschedule={
              canManage && bookings.section === "upcoming"
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
            cancellable={canManage && bookings.section === "upcoming"}
            manageable={canManage}
            canMessage={canMessage}
            reschedule={
              canManage && bookings.section === "upcoming"
                ? rescheduleByHub.get(booking.hub.id)
                : undefined
            }
          />
        ))}
      />
    );
  }

  const [courtBookings, eventRegistrations, trainerSessions] = await Promise.all([
    listMyBookings(),
    listMyEventRegistrations(),
    prisma.trainerSession.findMany({
      where: { playerId: user.id },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      include: {
        trainer: {
          select: {
            area: true,
            locationDetails: true,
            user: { select: { username: true, name: true, playerName: true } },
          },
        },
        payment: { select: { id: true, status: true } },
      },
    }),
  ]);

  const section: PlayerBookingSection =
    firstSearchValue(params.tab) === "history" ? "history" : "upcoming";
  const query = firstSearchValue(params.q).trim().slice(0, 100);
  const requestedType = firstSearchValue(params.type) as PlayerBookingType;
  const requestedStatus = firstSearchValue(
    params.status
  ) as PlayerBookingStatus;
  const requestedFrom = firstSearchValue(params.from);
  const requestedTo = firstSearchValue(params.to);
  const filters: PlayerBookingFilters = {
    section,
    query: query || undefined,
    type: playerBookingTypes.includes(requestedType) ? requestedType : "all",
    status: playerBookingStatuses.includes(requestedStatus)
      ? requestedStatus
      : undefined,
    from: isValidDateString(requestedFrom) ? requestedFrom : undefined,
    to: isValidDateString(requestedTo) ? requestedTo : undefined,
  };
  const selectedCourtBookings =
    section === "upcoming" ? courtBookings.upcoming : courtBookings.past;
  const selectedEventRegistrations =
    section === "upcoming"
      ? eventRegistrations.upcoming
      : eventRegistrations.past;
  const filteredCourtBookings =
    filters.type === "events" || filters.type === "trainers"
      ? []
      : filterPlayerCourtBookings(selectedCourtBookings, filters);
  const filteredEventRegistrations =
    filters.type === "courts" || filters.type === "trainers"
      ? []
      : filterPlayerEventRegistrations(selectedEventRegistrations, filters);
  const filteredTrainerSessions = trainerSessions.filter((session) => {
    const inSection = section === "upcoming"
      ? session.startsAt >= new Date() && !["COMPLETED", "CANCELLED", "DECLINED", "EXPIRED", "REFUNDED"].includes(session.status)
      : session.startsAt < new Date() || ["COMPLETED", "CANCELLED", "DECLINED", "EXPIRED", "REFUNDED"].includes(session.status);
    const statusMatches = !filters.status || session.status === filters.status;
    return filters.type !== "courts" && filters.type !== "events" && inSection && statusMatches && matchesPlayerDate(session.date, filters.from, filters.to) && matchesPlayerQuery([session.id, session.trainer.user.name, session.trainer.user.playerName, session.trainer.area], filters.query ?? "");
  });
  const trainerUpcomingCount = trainerSessions.filter((session) => session.startsAt >= new Date() && !["COMPLETED", "CANCELLED", "DECLINED", "EXPIRED", "REFUNDED"].includes(session.status)).length;
  const trainerHistoryCount = trainerSessions.length - trainerUpcomingCount;
  const upcomingCount =
    courtBookings.upcoming.length + eventRegistrations.upcoming.length + trainerUpcomingCount;
  const historyCount = courtBookings.past.length + eventRegistrations.past.length + trainerHistoryCount;

  return (
    <PlayerBookingsView
      section={section}
      upcomingCount={upcomingCount}
      historyCount={historyCount}
      courtCount={filteredCourtBookings.length}
      eventCount={filteredEventRegistrations.length}
      trainerCount={filteredTrainerSessions.length}
      filters={{
        query,
        type: filters.type,
        status: filters.status ?? "",
        from: filters.from ?? "",
        to: filters.to ?? "",
      }}
      upcomingHref={playerBookingsHref(filters, { section: "upcoming" })}
      historyHref={playerBookingsHref(filters, { section: "history" })}
      clearHref={playerBookingsHref({ section, type: "all" })}
      courtBookings={filteredCourtBookings.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          view="player"
          cancellable={section === "upcoming"}
        />
      ))}
      eventRegistrations={filteredEventRegistrations.map((registration) => (
        <PlayerEventRegistrationCard
          key={registration.id}
          registration={registration}
        />
      ))}
      trainerSessions={filteredTrainerSessions.map((session) => (
        <PlayerTrainerSessionCard key={session.id} session={session} />
      ))}
    />
  );
}
