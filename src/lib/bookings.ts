import "server-only";

import { cache } from "react";
import { Prisma } from "@prisma/client";
import type {
  BookingStatus,
  CancelledBy,
  RescheduledBy,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/dal";
import { requirePartner } from "@/lib/hubs";
import { buildSlots, type Slot } from "@/lib/slots";
import { isEntitled } from "@/lib/billing";
import { manilaNowHour, manilaToday } from "@/lib/time";
import { CANCEL_CUTOFF_HOURS, type OperatingHours } from "@/lib/constants";

// Where a booking was before the venue moved it. Everything here is a
// snapshot — the court may since have been renamed or deleted, and the player
// should still see what they were originally told.
export type BookingMove = {
  by: RescheduledBy;
  reason: string | null;
  courtName: string | null;
  date: string;
  startHour: number;
  endHour: number;
  totalPrice: number | null;
  count: number;
};

export type BookingView = {
  id: string;
  status: BookingStatus;
  date: string;
  startHour: number;
  endHour: number;
  hours: number;
  startsAt: Date;
  endsAt: Date;
  hourlyRate: number | null;
  totalPrice: number | null;
  notes: string | null;
  cancelledBy: CancelledBy | null;
  cancelReason: string | null;
  // Where this booking was before the venue moved it, or null if it never
  // moved. Assembled here rather than at render time, like the flag below.
  movedFrom: BookingMove | null;
  // Whether the player's self-cancel window has closed. Decided here rather
  // than at render time so components stay pure — and so it matches the same
  // cutoff cancelMyBookingAction enforces.
  playerCancelCutoffPassed: boolean;
  court: { id: string; name: string; courtType: string };
  hub: { id: string; name: string; logo: string | null; address: string | null };
  player: {
    id: string;
    name: string | null;
    playerName: string | null;
    phone: string | null;
  };
};

const bookingSelect = {
  id: true,
  status: true,
  date: true,
  startHour: true,
  endHour: true,
  hours: true,
  startsAt: true,
  endsAt: true,
  hourlyRate: true,
  totalPrice: true,
  notes: true,
  cancelledBy: true,
  cancelReason: true,
  rescheduledAt: true,
  rescheduledBy: true,
  rescheduleReason: true,
  rescheduleCount: true,
  prevCourtName: true,
  prevDate: true,
  prevStartHour: true,
  prevEndHour: true,
  prevTotalPrice: true,
  court: { select: { id: true, name: true, courtType: true } },
  hub: { select: { id: true, name: true, logo: true, address: true } },
  user: {
    select: { id: true, name: true, playerName: true, phone: true },
  },
} as const;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

// Prisma.Decimal isn't serializable across the RSC boundary — same reason
// mapCourt exists in hubs.ts.
function mapBooking(row: BookingRow): BookingView {
  const {
    user,
    hourlyRate,
    totalPrice,
    rescheduledAt,
    rescheduledBy,
    rescheduleReason,
    rescheduleCount,
    prevCourtName,
    prevDate,
    prevStartHour,
    prevEndHour,
    prevTotalPrice,
    ...rest
  } = row;

  const moved =
    rescheduledAt != null &&
    rescheduledBy != null &&
    prevDate != null &&
    prevStartHour != null &&
    prevEndHour != null;

  return {
    ...rest,
    hourlyRate: hourlyRate ? hourlyRate.toNumber() : null,
    totalPrice: totalPrice ? totalPrice.toNumber() : null,
    movedFrom: moved
      ? {
          by: rescheduledBy,
          reason: rescheduleReason,
          courtName: prevCourtName,
          date: prevDate,
          startHour: prevStartHour,
          endHour: prevEndHour,
          totalPrice: prevTotalPrice ? prevTotalPrice.toNumber() : null,
          count: rescheduleCount,
        }
      : null,
    playerCancelCutoffPassed:
      row.startsAt.getTime() - Date.now() < CANCEL_CUTOFF_HOURS * 3_600_000,
    player: user,
  };
}

// The hours already occupied on a court for one Manila date, sorted ascending.
// Only live BookingSlot rows exist (cancelling deletes them), so no status
// filter is needed here.
export async function getBookedHours(
  courtId: string,
  date: string
): Promise<number[]> {
  const rows = await prisma.bookingSlot.findMany({
    where: { courtId, date },
    select: { hour: true },
    orderBy: { hour: "asc" },
  });
  return rows.map((r) => r.hour);
}

// Like getBookedHours, but ignores one booking's own slots. The reschedule
// picker needs the booking's CURRENT hours to show as selectable rather than
// as "booked by itself" — and the action needs the same view, so re-picking
// its own hours doesn't read as a clash.
export async function getBookedHoursExcluding(
  courtId: string,
  date: string,
  excludeBookingId: string
): Promise<number[]> {
  const rows = await prisma.bookingSlot.findMany({
    where: { courtId, date, bookingId: { not: excludeBookingId } },
    select: { hour: true },
    orderBy: { hour: "asc" },
  });
  return rows.map((r) => r.hour);
}

// A court plus the hub schedule its availability derives from. Memoized so the
// page and the action don't double-query within one request.
export const getCourtForBooking = cache(async (courtId: string) => {
  const row = await prisma.court.findUnique({
    where: { id: courtId },
    select: {
      id: true,
      name: true,
      courtType: true,
      hourlyRate: true,
      hub: {
        select: {
          id: true,
          name: true,
          operatingHours: true,
          owner: {
            select: {
              subscription: {
                select: {
                  status: true,
                  trialEndsAt: true,
                  currentPeriodEnd: true,
                  graceEndsAt: true,
                  cancelAtPeriodEnd: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    courtType: row.courtType,
    hourlyRate: row.hourlyRate ? row.hourlyRate.toNumber() : null,
    hub: {
      id: row.hub.id,
      name: row.hub.name,
      operatingHours: (row.hub.operatingHours as OperatingHours | null) ?? null,
      // A venue whose subscription has lapsed keeps its data but stops taking
      // new bookings.
      bookable: isEntitled(row.hub.owner.subscription),
    },
  };
});

export type CourtAvailability = {
  courtId: string;
  hubId: string;
  date: string;
  closed: boolean;
  slots: Slot[];
  bookedHours: number[];
};

// The initial (server-rendered) availability for a court+date. The SSE stream
// keeps it fresh from there.
export async function getCourtAvailability(
  courtId: string,
  date: string
): Promise<CourtAvailability | null> {
  const court = await getCourtForBooking(courtId);
  if (!court) return null;

  const bookedHours = await getBookedHours(courtId, date);
  const { closed, slots } = buildSlots({
    operatingHours: court.hub.operatingHours,
    date,
    bookedHours,
    today: manilaToday(),
    nowHour: manilaNowHour(),
  });

  return { courtId, hubId: court.hub.id, date, closed, slots, bookedHours };
}

// --- Player surfaces --------------------------------------------------------

// "Upcoming" is CONFIRMED and not yet finished; comparing real instants is why
// startsAt/endsAt are stored alongside the civil date.
export async function listMyBookings(): Promise<{
  upcoming: BookingView[];
  past: BookingView[];
}> {
  const viewer = await getViewer();
  if (!viewer) return { upcoming: [], past: [] };

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: viewer.id, status: "CONFIRMED", endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: bookingSelect,
    }),
    prisma.booking.findMany({
      where: {
        userId: viewer.id,
        OR: [{ endsAt: { lt: now } }, { status: "CANCELLED" }],
      },
      orderBy: { startsAt: "desc" },
      take: 50,
      select: bookingSelect,
    }),
  ]);

  return { upcoming: upcoming.map(mapBooking), past: past.map(mapBooking) };
}

export async function countMyUpcomingBookings(): Promise<number> {
  const viewer = await getViewer();
  if (!viewer) return 0;
  return prisma.booking.count({
    where: {
      userId: viewer.id,
      status: "CONFIRMED",
      endsAt: { gte: new Date() },
    },
  });
}

export async function getMyNextBooking(): Promise<BookingView | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const row = await prisma.booking.findFirst({
    where: {
      userId: viewer.id,
      status: "CONFIRMED",
      endsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
    select: bookingSelect,
  });
  return row ? mapBooking(row) : null;
}

// --- Partner surface --------------------------------------------------------

// Bookings across a hub's courts. Returns null when the hub isn't owned by the
// current partner, so the page can notFound() — same shape as getMyHub.
export async function listHubBookings(hubId: string): Promise<{
  upcoming: BookingView[];
  past: BookingView[];
} | null> {
  const partner = await requirePartner();
  const owned = await prisma.hub.findFirst({
    where: { id: hubId, ownerId: partner.id },
    select: { id: true },
  });
  if (!owned) return null;

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      where: { hubId, status: "CONFIRMED", endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: bookingSelect,
    }),
    prisma.booking.findMany({
      where: {
        hubId,
        OR: [{ endsAt: { lt: now } }, { status: "CANCELLED" }],
      },
      orderBy: { startsAt: "desc" },
      take: 50,
      select: bookingSelect,
    }),
  ]);

  return { upcoming: upcoming.map(mapBooking), past: past.map(mapBooking) };
}
