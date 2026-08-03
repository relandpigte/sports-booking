import "server-only";

import { cache } from "react";
import { Prisma } from "@prisma/client";
import type {
  BookingStatus,
  CancelledBy,
  PaymentStatus,
  RescheduledBy,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/dal";
import { requireActivePartner } from "@/lib/hubs";
import { buildSlots, type Slot } from "@/lib/slots";
import { manilaNowHour, manilaToday } from "@/lib/time";
import type { OperatingHours } from "@/lib/constants";
import { isServiceFeeOverdue } from "@/lib/service-fees";

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
  holdExpiresAt: Date | null;
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
  // Present only for a booking made at a venue that takes payment online.
  // Deliberately just the id and the state — a card renders "Paid", it never
  // needs the gateway's side of the story.
  payment: {
    id: string;
    status: PaymentStatus;
    // The checkout subtotal and our share of it. PayMongo's method-specific
    // pass-on processing fee is not known until the player chooses a method.
    amount: number;
    platformFee: number;
  } | null;
  court: { id: string; name: string; courtType: string };
  hub: {
    id: string;
    slug: string | null;
    name: string;
    logo: string | null;
    address: string | null;
  };
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
  holdExpiresAt: true,
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
  bookingPayment: {
    select: { id: true, status: true, amount: true, platformFee: true },
  },
  court: { select: { id: true, name: true, courtType: true } },
  hub: {
    select: { id: true, slug: true, name: true, logo: true, address: true },
  },
  user: {
    select: { id: true, name: true, playerName: true, phone: true },
  },
} as const;

type BookingRow = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

// The status a booking really has right now. A lapsed hold is EXPIRED even
// though the column still says PENDING, because the sweep is hygiene and may
// not have run — same reasoning as the availability predicate above.
function effectiveStatus(row: {
  status: BookingStatus;
  holdExpiresAt: Date | null;
}): BookingStatus {
  return row.status === "PENDING" &&
    row.holdExpiresAt != null &&
    row.holdExpiresAt <= new Date()
    ? "EXPIRED"
    : row.status;
}

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
    bookingPayment,
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
    // A PENDING booking whose hold has lapsed IS expired, whether or not the
    // sweep has run. Every renderer reads this, never the stored column.
    status: effectiveStatus(row),
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
    payment: bookingPayment
      ? {
          id: bookingPayment.id,
          status: bookingPayment.status,
          amount: Number(bookingPayment.amount),
          platformFee: Number(bookingPayment.platformFee),
        }
      : null,
    player: user,
  };
}

// A slot row still holding its hour: either a settled booking (holdExpiresAt
// null) or an unpaid hold that hasn't lapsed yet.
//
// The predicate is evaluated INSIDE THE QUERY against the clock, which is the
// whole point: an expired hold stops blocking the grid the moment it lapses,
// with ZERO writes and no scheduler. Nothing here waits on the sweep — the
// sweep only deletes the dead rows afterwards.
//
function holdingHourWhere(now: Date): Prisma.BookingSlotWhereInput {
  return { OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }] };
}

// A booking that is really holding court time right now: confirmed, or a live
// unpaid hold. Time-based, so it needs no sweep either.
export function liveBookingWhere(
  now: Date = new Date()
): Prisma.BookingWhereInput {
  return {
    OR: [
      { status: "CONFIRMED" },
      { status: "PENDING", holdExpiresAt: { gt: now } },
    ],
  };
}

// Bookings that belong in a "history" list: finished, cancelled, expired, or a
// hold that lapsed but hasn't been swept yet.
export function endedBookingWhere(
  now: Date = new Date()
): Prisma.BookingWhereInput {
  return {
    OR: [
      { endsAt: { lt: now } },
      { status: { in: ["CANCELLED", "EXPIRED"] } },
      { status: "PENDING", holdExpiresAt: { lte: now } },
    ],
  };
}

// The hours already occupied on a court for one Manila date, sorted ascending.
export type CourtOccupancy = {
  courtId: string;
  date: string;
  bookedHours: number[];
  openPlayHours: number[];
};

export async function getCourtOccupancy(
  courtId: string,
  date: string
): Promise<CourtOccupancy> {
  const rows = await prisma.bookingSlot.findMany({
    where: { courtId, date, ...holdingHourWhere(new Date()) },
    select: { hour: true, eventId: true },
    orderBy: { hour: "asc" },
  });
  return {
    courtId,
    date,
    bookedHours: rows.map((row) => row.hour),
    openPlayHours: rows
      .filter((row) => row.eventId != null)
      .map((row) => row.hour),
  };
}

// One query for the public comparison view. Empty courts are included so the
// client can render them immediately instead of waiting for an occupied row.
export async function getHubCourtOccupancies(
  hubId: string,
  date: string,
  knownCourtIds?: string[]
): Promise<CourtOccupancy[]> {
  const courts = knownCourtIds
    ? knownCourtIds.map((id) => ({ id }))
    : await prisma.court.findMany({
        where: { hubId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
  const courtIds = courts.map((court) => court.id);
  const rows = await prisma.bookingSlot.findMany({
    where: {
      courtId: { in: courtIds },
      date,
      ...holdingHourWhere(new Date()),
    },
    select: { courtId: true, hour: true, eventId: true },
    orderBy: [{ courtId: "asc" }, { hour: "asc" }],
  });

  const byCourt = new Map<
    string,
    { bookedHours: number[]; openPlayHours: number[] }
  >();
  for (const row of rows) {
    const occupancy = byCourt.get(row.courtId) ?? {
      bookedHours: [],
      openPlayHours: [],
    };
    occupancy.bookedHours.push(row.hour);
    if (row.eventId != null) occupancy.openPlayHours.push(row.hour);
    byCourt.set(row.courtId, occupancy);
  }

  return courts.map((court) => ({
    courtId: court.id,
    date,
    bookedHours: byCourt.get(court.id)?.bookedHours ?? [],
    openPlayHours: byCourt.get(court.id)?.openPlayHours ?? [],
  }));
}

export async function getBookedHours(
  courtId: string,
  date: string
): Promise<number[]> {
  return (await getCourtOccupancy(courtId, date)).bookedHours;
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
    where: {
      courtId,
      date,
      AND: [
        {
          OR: [
            { bookingId: null },
            { bookingId: { not: excludeBookingId } },
          ],
        },
        holdingHourWhere(new Date()),
      ],
    },
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
      scheduleRules: {
        select: {
          weekday: true,
          hour: true,
          closed: true,
          closureReason: true,
          hourlyRate: true,
        },
      },
      hub: {
        select: {
          id: true,
          name: true,
          operatingHours: true,
          // Whose gateway a payment would go to, if this venue has connected
          // one — the booking action needs it before it writes anything.
          ownerId: true,
          owner: {
            select: {
              partnerStatus: true,
              partnerGateway: { select: { disconnectedAt: true } },
            },
          },
        },
      },
    },
  });
  if (!row) return null;
  const approved = row.hub.owner.partnerStatus === "ACTIVE";
  const connected = row.hub.owner.partnerGateway?.disconnectedAt === null;
  const overdue =
    approved && connected
      ? await isServiceFeeOverdue(row.hub.ownerId)
      : false;
  return {
    id: row.id,
    name: row.name,
    courtType: row.courtType,
    hourlyRate: row.hourlyRate ? row.hourlyRate.toNumber() : null,
    scheduleRules: row.scheduleRules.map((rule) => ({
      weekday: rule.weekday,
      hour: rule.hour,
      closed: rule.closed,
      closureReason: rule.closureReason,
      hourlyRate: rule.hourlyRate ? rule.hourlyRate.toNumber() : null,
    })),
    hub: {
      id: row.hub.id,
      name: row.hub.name,
      ownerId: row.hub.ownerId,
      operatingHours: (row.hub.operatingHours as OperatingHours | null) ?? null,
      bookable: approved && connected && !overdue,
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
  openPlayHours: number[];
};

// The initial (server-rendered) availability for a court+date. The SSE stream
// keeps it fresh from there.
export async function getCourtAvailability(
  courtId: string,
  date: string
): Promise<CourtAvailability | null> {
  const court = await getCourtForBooking(courtId);
  if (!court) return null;

  const { bookedHours, openPlayHours } = await getCourtOccupancy(courtId, date);
  const { closed, slots } = buildSlots({
    operatingHours: court.hub.operatingHours,
    date,
    bookedHours,
    openPlayHours,
    today: manilaToday(),
    nowHour: manilaNowHour(),
    courtHourlyRate: court.hourlyRate,
    scheduleRules: court.scheduleRules,
  });

  return {
    courtId,
    hubId: court.hub.id,
    date,
    closed,
    slots,
    bookedHours,
    openPlayHours,
  };
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
      where: { userId: viewer.id, ...liveBookingWhere(now), endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: bookingSelect,
    }),
    prisma.booking.findMany({
      where: {
        userId: viewer.id,
        ...endedBookingWhere(now),
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
      ...liveBookingWhere(),
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
      ...liveBookingWhere(),
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
  const partner = await requireActivePartner();
  const owned = await prisma.hub.findFirst({
    where: { id: hubId, ownerId: partner.id },
    select: { id: true },
  });
  if (!owned) return null;

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      where: { hubId, ...liveBookingWhere(now), endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      select: bookingSelect,
    }),
    prisma.booking.findMany({
      where: {
        hubId,
        ...endedBookingWhere(now),
      },
      orderBy: { startsAt: "desc" },
      take: 50,
      select: bookingSelect,
    }),
  ]);

  return { upcoming: upcoming.map(mapBooking), past: past.map(mapBooking) };
}

// Consolidated partner inbox across every owned hub. Ownership is expressed in
// the query itself, so adding a hub filter later cannot expose another venue.
export async function listPartnerBookings(): Promise<{
  upcoming: BookingView[];
  past: BookingView[];
}> {
  const partner = await requireActivePartner();
  const now = new Date();
  const owned = { hub: { ownerId: partner.id } };
  const [upcoming, past] = await Promise.all([
    prisma.booking.findMany({
      where: {
        ...owned,
        ...liveBookingWhere(now),
        endsAt: { gte: now },
      },
      orderBy: { startsAt: "asc" },
      select: bookingSelect,
    }),
    prisma.booking.findMany({
      where: {
        ...owned,
        ...endedBookingWhere(now),
      },
      orderBy: { startsAt: "desc" },
      take: 100,
      select: bookingSelect,
    }),
  ]);
  return { upcoming: upcoming.map(mapBooking), past: past.map(mapBooking) };
}
