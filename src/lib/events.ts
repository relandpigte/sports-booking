import "server-only";

import { Prisma, type EventRegistrationStatus, type EventStatus } from "@prisma/client";

import type { OperatingHours } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { buildSlots } from "@/lib/slots";
import { manilaNowHour, manilaToday } from "@/lib/time";

export type EventCourtView = {
  id: string;
  name: string;
  courtType: string;
};

export type EventRegistrationView = {
  id: string;
  status: EventRegistrationStatus;
  holdExpiresAt: Date | null;
  paymentId: string | null;
  paymentStatus: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED" | null;
};

export type PublicEventView = {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  sport: string;
  date: string;
  startHour: number;
  endHour: number;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  registrationFee: number;
  status: EventStatus;
  confirmedCount: number;
  pendingCount: number;
  waitlistedCount: number;
  remainingSpots: number;
  full: boolean;
  hub: {
    id: string;
    slug: string | null;
    name: string;
    logo: string | null;
    address: string | null;
    verified: boolean;
  };
  courts: EventCourtView[];
};

export type EventDetailView = PublicEventView & {
  attendees: {
    id: string;
    name: string | null;
    playerName: string | null;
    image: string | null;
  }[];
  viewerRegistration: EventRegistrationView | null;
  ownerId: string;
  cancelReason: string | null;
};

export type MyEventView = PublicEventView & {
  expectedRevenue: number;
};

export type EventFormHub = {
  id: string;
  name: string;
  games: string[];
  paymentReady: boolean;
  courts: EventCourtView[];
};

export type EventEditorView = {
  id: string;
  publicId: string;
  hubId: string;
  title: string;
  description: string | null;
  sport: string;
  date: string;
  startHour: number;
  endHour: number;
  capacity: number;
  registrationFee: number;
  status: EventStatus;
  courtIds: string[];
};

export type OwnerEventRegistrationView = {
  id: string;
  status: EventRegistrationStatus;
  createdAt: Date;
  player: {
    id: string;
    name: string | null;
    playerName: string | null;
    image: string | null;
    email: string;
  };
  payment: {
    id: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
    amount: number;
  } | null;
};

const eventSelect = {
  id: true,
  publicId: true,
  title: true,
  description: true,
  sport: true,
  date: true,
  startHour: true,
  endHour: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  registrationFee: true,
  status: true,
  cancelReason: true,
  hub: {
    select: {
      id: true,
      slug: true,
      ownerId: true,
      name: true,
      logo: true,
      address: true,
      owner: {
        select: {
          partnerStatus: true,
          partnerGateway: { select: { disconnectedAt: true } },
        },
      },
    },
  },
  courts: {
    select: {
      court: {
        select: { id: true, name: true, courtType: true },
      },
    },
    orderBy: { court: { createdAt: "asc" } },
  },
  registrations: {
    select: {
      id: true,
      userId: true,
      status: true,
      holdExpiresAt: true,
      bookingPaymentId: true,
      payment: { select: { status: true, venueAmount: true } },
      user: {
        select: {
          id: true,
          name: true,
          playerName: true,
          image: true,
          privateProfile: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

type EventRow = Prisma.EventGetPayload<{ select: typeof eventSelect }>;

function registrationCounts(row: EventRow, now = new Date()) {
  const confirmed = row.registrations.filter(
    (registration) => registration.status === "CONFIRMED"
  );
  const pending = row.registrations.filter(
    (registration) =>
      registration.status === "PENDING" &&
      registration.holdExpiresAt != null &&
      registration.holdExpiresAt > now
  );
  const waitlisted = row.registrations.filter(
    (registration) => registration.status === "WAITLISTED"
  );
  const occupied = confirmed.length + pending.length;
  return {
    confirmed,
    pending,
    waitlisted,
    remaining: Math.max(0, row.capacity - occupied),
    full: occupied >= row.capacity,
  };
}

function mapPublicEvent(row: EventRow, now = new Date()): PublicEventView {
  const counts = registrationCounts(row, now);
  return {
    id: row.id,
    publicId: row.publicId,
    title: row.title,
    description: row.description,
    sport: row.sport,
    date: row.date,
    startHour: row.startHour,
    endHour: row.endHour,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    capacity: row.capacity,
    registrationFee: Number(row.registrationFee),
    status: row.status,
    confirmedCount: counts.confirmed.length,
    pendingCount: counts.pending.length,
    waitlistedCount: counts.waitlisted.length,
    remainingSpots: counts.remaining,
    full: counts.full,
    hub: {
      id: row.hub.id,
      slug: row.hub.slug,
      name: row.hub.name,
      logo: row.hub.logo,
      address: row.hub.address,
      verified: row.hub.owner.partnerGateway?.disconnectedAt === null,
    },
    courts: row.courts.map(({ court }) => court),
  };
}

export type PublicEventPeriod = "all" | "today" | "upcoming" | "past";

export async function listPublicEvents(
  period: PublicEventPeriod = "all"
): Promise<PublicEventView[]> {
  const today = manilaToday();
  const rows = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      hub: { owner: { partnerStatus: "ACTIVE" } },
      ...(period === "today"
        ? { date: today }
        : period === "upcoming"
          ? { date: { gt: today } }
          : period === "past"
            ? { date: { lt: today } }
            : {}),
    },
    orderBy: { startsAt: period === "past" ? "desc" : "asc" },
    take: 120,
    select: eventSelect,
  });
  const now = new Date();
  return rows.map((row) => mapPublicEvent(row, now));
}

export async function listPublicEventSitemapEntries(): Promise<
  { publicId: string; updatedAt: Date }[]
> {
  return prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      date: { gte: manilaToday() },
      hub: { owner: { partnerStatus: "ACTIVE" } },
    },
    orderBy: { startsAt: "asc" },
    take: 240,
    select: { publicId: true, updatedAt: true },
  });
}

export async function getPublicEvent(
  publicId: string,
  viewerId?: string | null
): Promise<EventDetailView | null> {
  const row = await prisma.event.findUnique({
    where: { publicId },
    select: eventSelect,
  });
  if (
    !row ||
    row.status === "DRAFT" ||
    row.hub.owner.partnerStatus !== "ACTIVE"
  ) {
    return null;
  }

  const mapped = mapPublicEvent(row);
  const viewer = viewerId
    ? row.registrations.find((registration) => registration.userId === viewerId)
    : null;

  return {
    ...mapped,
    ownerId: row.hub.ownerId,
    cancelReason: row.cancelReason,
    attendees: row.registrations
      .filter((registration) => registration.status === "CONFIRMED")
      .map((registration) =>
        registration.user.privateProfile
          ? {
              id: registration.user.id,
              name: null,
              playerName: "Private player",
              image: null,
            }
          : {
              id: registration.user.id,
              name: registration.user.name,
              playerName: registration.user.playerName,
              image: registration.user.image,
            }
      ),
    viewerRegistration: viewer
      ? {
          id: viewer.id,
          status:
            viewer.status === "PENDING" &&
            viewer.holdExpiresAt != null &&
            viewer.holdExpiresAt <= new Date()
              ? "EXPIRED"
              : viewer.status,
          holdExpiresAt: viewer.holdExpiresAt,
          paymentId: viewer.bookingPaymentId,
          paymentStatus: viewer.payment?.status ?? null,
        }
      : null,
  };
}

export async function listMyEvents(ownerId: string): Promise<MyEventView[]> {
  const rows = await prisma.event.findMany({
    where: { hub: { ownerId } },
    orderBy: { startsAt: "asc" },
    select: eventSelect,
  });
  const now = new Date();
  return rows.map((row) => {
    const mapped = mapPublicEvent(row, now);
    const expectedRevenue = row.registrations
      .filter(
        (registration) =>
          registration.status === "CONFIRMED" &&
          registration.payment?.status === "SUCCEEDED"
      )
      .reduce(
        (total, registration) =>
          total + Number(registration.payment?.venueAmount ?? 0),
        0
      );
    return { ...mapped, expectedRevenue };
  });
}

export async function listEventFormHubs(
  ownerId: string
): Promise<EventFormHub[]> {
  const rows = await prisma.hub.findMany({
    where: { ownerId, courts: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      games: true,
      owner: {
        select: {
          partnerGateway: { select: { disconnectedAt: true } },
        },
      },
      courts: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, courtType: true },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    games: row.games,
    paymentReady: row.owner.partnerGateway?.disconnectedAt === null,
    courts: row.courts,
  }));
}

export async function getEventEditor(
  publicId: string,
  ownerId: string
): Promise<EventEditorView | null> {
  const row = await prisma.event.findFirst({
    where: { publicId, hub: { ownerId } },
    select: {
      id: true,
      publicId: true,
      hubId: true,
      title: true,
      description: true,
      sport: true,
      date: true,
      startHour: true,
      endHour: true,
      capacity: true,
      registrationFee: true,
      status: true,
      courts: { select: { courtId: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    registrationFee: Number(row.registrationFee),
    courtIds: row.courts.map((court) => court.courtId),
  };
}

export async function listOwnerEventRegistrations(
  eventId: string,
  ownerId: string
): Promise<OwnerEventRegistrationView[] | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, hub: { ownerId } },
    select: {
      registrations: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          holdExpiresAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
              playerName: true,
              image: true,
              email: true,
            },
          },
          payment: {
            select: { id: true, status: true, amount: true },
          },
        },
      },
    },
  });
  if (!event) return null;
  const now = new Date();
  return event.registrations.map((registration) => ({
    id: registration.id,
    status:
      registration.status === "PENDING" &&
      registration.holdExpiresAt != null &&
      registration.holdExpiresAt <= now
        ? "EXPIRED"
        : registration.status,
    createdAt: registration.createdAt,
    player: registration.user,
    payment: registration.payment
      ? {
          id: registration.payment.id,
          status: registration.payment.status,
          amount: Number(registration.payment.amount),
        }
      : null,
  }));
}

export type EventCourtAvailability = {
  id: string;
  name: string;
  courtType: string;
  available: boolean;
  reason: string | null;
};

export async function getEventCourtAvailability(args: {
  ownerId: string;
  hubId: string;
  date: string;
  startHour: number;
  endHour: number;
  excludeEventId?: string | null;
}): Promise<EventCourtAvailability[] | null> {
  const hub = await prisma.hub.findFirst({
    where: { id: args.hubId, ownerId: args.ownerId },
    select: {
      operatingHours: true,
      courts: {
        orderBy: { createdAt: "asc" },
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
        },
      },
    },
  });
  if (!hub) return null;

  const slots = await prisma.bookingSlot.findMany({
    where: {
      courtId: { in: hub.courts.map((court) => court.id) },
      date: args.date,
      AND: [
        args.excludeEventId
          ? {
              OR: [
                { eventId: null },
                { eventId: { not: args.excludeEventId } },
              ],
            }
          : {},
        {
          OR: [
            { holdExpiresAt: null },
            { holdExpiresAt: { gt: new Date() } },
          ],
        },
      ],
    },
    select: { courtId: true, hour: true },
  });

  const bookedByCourt = new Map<string, number[]>();
  for (const slot of slots) {
    const hours = bookedByCourt.get(slot.courtId) ?? [];
    hours.push(slot.hour);
    bookedByCourt.set(slot.courtId, hours);
  }

  const requestedHours = Array.from(
    { length: Math.max(0, args.endHour - args.startHour) },
    (_, index) => args.startHour + index
  );
  const operatingHours =
    (hub.operatingHours as OperatingHours | null) ?? null;

  return hub.courts.map((court) => {
    const built = buildSlots({
      operatingHours,
      date: args.date,
      bookedHours: bookedByCourt.get(court.id) ?? [],
      today: manilaToday(),
      nowHour: manilaNowHour(),
      courtHourlyRate: court.hourlyRate ? Number(court.hourlyRate) : null,
      scheduleRules: court.scheduleRules.map((rule) => ({
        ...rule,
        hourlyRate: rule.hourlyRate ? Number(rule.hourlyRate) : null,
      })),
    });
    if (built.closed) {
      return {
        id: court.id,
        name: court.name,
        courtType: court.courtType,
        available: false,
        reason: "The hub is closed on this day.",
      };
    }
    const requested = requestedHours.map((hour) =>
      built.slots.find((slot) => slot.hour === hour)
    );
    const missing = requested.some((slot) => !slot);
    const conflict = requested.find((slot) => slot && !slot.available);
    return {
      id: court.id,
      name: court.name,
      courtType: court.courtType,
      available: !missing && !conflict,
      reason: missing
        ? "The time is outside operating hours."
        : conflict?.reason === "closed"
          ? conflict.closureReason
            ? `Closed: ${conflict.closureReason}`
            : "Closed by the weekly schedule."
          : conflict?.reason === "past"
            ? "That time has already started."
            : conflict
              ? "Conflicts with a booking or another event."
              : null,
    };
  });
}
