import "server-only";

import { Prisma, type EventRegistrationStatus, type EventStatus } from "@prisma/client";

import type { OperatingHours } from "@/lib/constants";
import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/dal";
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
    venueAmount: number;
    platformFee: number;
    providerRef: string | null;
    paidAt: Date | null;
    refundedAt: Date | null;
  } | null;
};

export type OwnerEventDetailView = EventEditorView & {
  startsAt: Date;
  endsAt: Date;
  cancelReason: string | null;
  confirmedCount: number;
  pendingCount: number;
  waitlistedCount: number;
  remainingSpots: number;
  hub: {
    id: string;
    name: string;
    address: string | null;
  };
  courts: EventCourtView[];
  registrations: OwnerEventRegistrationView[];
  finance: {
    successfulPayments: number;
    pendingPayments: number;
    refundedPayments: number;
    partnerRevenue: number;
    platformFees: number;
    checkoutSubtotal: number;
    refundedPartnerRevenue: number;
  };
};

export type PlayerEventRegistrationView = {
  id: string;
  status: EventRegistrationStatus;
  holdExpiresAt: Date | null;
  secondsLeft: number;
  cancelReason: string | null;
  createdAt: Date;
  event: {
    publicId: string;
    title: string;
    sport: string;
    date: string;
    startHour: number;
    endHour: number;
    startsAt: Date;
    endsAt: Date;
    registrationFee: number;
    status: EventStatus;
    cancelReason: string | null;
    hub: {
      name: string;
      logo: string | null;
    };
    courts: EventCourtView[];
  };
  payment: {
    id: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
    amount: number;
    platformFee: number;
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
      payment: { select: { status: true } },
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
  const now = new Date();
  const rows = await prisma.event.findMany({
    where: {
      status: "PUBLISHED",
      hub: { owner: { partnerStatus: "ACTIVE" } },
      ...(period === "today"
        ? { date: today }
        : period === "upcoming"
          ? { endsAt: { gt: now } }
          : period === "past"
            ? { endsAt: { lte: now } }
            : {}),
    },
    orderBy: { startsAt: period === "past" ? "desc" : "asc" },
    take: 120,
    select: eventSelect,
  });
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

export async function listMyEvents(ownerId: string): Promise<PublicEventView[]> {
  const rows = await prisma.event.findMany({
    where: { hub: { ownerId } },
    orderBy: { startsAt: "asc" },
    select: eventSelect,
  });
  const now = new Date();
  return rows.map((row) => mapPublicEvent(row, now));
}

const playerEventRegistrationSelect = {
  id: true,
  status: true,
  holdExpiresAt: true,
  cancelReason: true,
  createdAt: true,
  event: {
    select: {
      publicId: true,
      title: true,
      sport: true,
      date: true,
      startHour: true,
      endHour: true,
      startsAt: true,
      endsAt: true,
      registrationFee: true,
      status: true,
      cancelReason: true,
      hub: { select: { name: true, logo: true } },
      courts: {
        orderBy: { court: { createdAt: "asc" as const } },
        select: {
          court: { select: { id: true, name: true, courtType: true } },
        },
      },
    },
  },
  payment: {
    select: {
      id: true,
      status: true,
      amount: true,
      platformFee: true,
    },
  },
} as const;

type PlayerEventRegistrationRow = Prisma.EventRegistrationGetPayload<{
  select: typeof playerEventRegistrationSelect;
}>;

function mapPlayerEventRegistration(
  row: PlayerEventRegistrationRow,
  now: Date
): PlayerEventRegistrationView {
  return {
    ...row,
    status:
      row.status === "PENDING" &&
      row.holdExpiresAt != null &&
      row.holdExpiresAt <= now
        ? "EXPIRED"
        : row.status,
    secondsLeft: row.holdExpiresAt
      ? Math.max(
          0,
          Math.ceil((row.holdExpiresAt.getTime() - now.getTime()) / 1000)
        )
      : 0,
    event: {
      ...row.event,
      registrationFee: Number(row.event.registrationFee),
      courts: row.event.courts.map(({ court }) => court),
    },
    payment: row.payment
      ? {
          ...row.payment,
          amount: Number(row.payment.amount),
          platformFee: Number(row.payment.platformFee),
        }
      : null,
  };
}

export async function listMyEventRegistrations(): Promise<{
  upcoming: PlayerEventRegistrationView[];
  past: PlayerEventRegistrationView[];
}> {
  const viewer = await getViewer();
  if (!viewer) return { upcoming: [], past: [] };

  const now = new Date();
  const [upcoming, past] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: {
        userId: viewer.id,
        status: { not: "CANCELLED" },
        event: { endsAt: { gte: now }, status: { not: "CANCELLED" } },
      },
      orderBy: { event: { startsAt: "asc" } },
      select: playerEventRegistrationSelect,
    }),
    prisma.eventRegistration.findMany({
      where: {
        userId: viewer.id,
        OR: [
          { status: "CANCELLED" },
          { event: { endsAt: { lt: now } } },
          { event: { status: "CANCELLED" } },
        ],
      },
      orderBy: { event: { startsAt: "desc" } },
      take: 50,
      select: playerEventRegistrationSelect,
    }),
  ]);

  return {
    upcoming: upcoming.map((row) => mapPlayerEventRegistration(row, now)),
    past: past.map((row) => mapPlayerEventRegistration(row, now)),
  };
}

export async function getMyUpcomingEventRegistrationSummary(): Promise<{
  count: number;
  next: PlayerEventRegistrationView | null;
}> {
  const viewer = await getViewer();
  if (!viewer) return { count: 0, next: null };

  const now = new Date();
  const where: Prisma.EventRegistrationWhereInput = {
    userId: viewer.id,
    OR: [
      { status: "CONFIRMED" },
      { status: "PENDING", holdExpiresAt: { gt: now } },
    ],
    event: {
      status: "PUBLISHED",
      endsAt: { gte: now },
    },
  };
  const [count, next] = await Promise.all([
    prisma.eventRegistration.count({ where }),
    prisma.eventRegistration.findFirst({
      where,
      orderBy: { event: { startsAt: "asc" } },
      select: playerEventRegistrationSelect,
    }),
  ]);

  return {
    count,
    next: next ? mapPlayerEventRegistration(next, now) : null,
  };
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
            select: {
              id: true,
              status: true,
              amount: true,
              venueAmount: true,
              platformFee: true,
              providerRef: true,
              paidAt: true,
              refundedAt: true,
            },
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
          venueAmount: Number(registration.payment.venueAmount),
          platformFee: Number(registration.payment.platformFee),
          providerRef: registration.payment.providerRef,
          paidAt: registration.payment.paidAt,
          refundedAt: registration.payment.refundedAt,
        }
      : null,
  }));
}

export async function getOwnerEventDetails(
  publicId: string,
  ownerId: string
): Promise<OwnerEventDetailView | null> {
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
      startsAt: true,
      endsAt: true,
      capacity: true,
      registrationFee: true,
      status: true,
      cancelReason: true,
      hub: {
        select: {
          id: true,
          name: true,
          address: true,
        },
      },
      courts: {
        orderBy: { court: { createdAt: "asc" } },
        select: {
          court: {
            select: {
              id: true,
              name: true,
              courtType: true,
            },
          },
        },
      },
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
            select: {
              id: true,
              status: true,
              amount: true,
              venueAmount: true,
              platformFee: true,
              providerRef: true,
              paidAt: true,
              refundedAt: true,
            },
          },
        },
      },
    },
  });
  if (!row) return null;

  const now = new Date();
  const registrations: OwnerEventRegistrationView[] = row.registrations.map(
    (registration) => ({
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
            venueAmount: Number(registration.payment.venueAmount),
            platformFee: Number(registration.payment.platformFee),
            providerRef: registration.payment.providerRef,
            paidAt: registration.payment.paidAt,
            refundedAt: registration.payment.refundedAt,
          }
        : null,
    })
  );
  const confirmedCount = registrations.filter(
    (registration) => registration.status === "CONFIRMED"
  ).length;
  const pendingCount = registrations.filter(
    (registration) => registration.status === "PENDING"
  ).length;
  const waitlistedCount = registrations.filter(
    (registration) => registration.status === "WAITLISTED"
  ).length;
  const successfulPayments = registrations.filter(
    (registration) => registration.payment?.status === "SUCCEEDED"
  );
  const pendingPayments = registrations.filter(
    (registration) => registration.payment?.status === "PENDING"
  );
  const refundedPayments = registrations.filter(
    (registration) => registration.payment?.status === "REFUNDED"
  );

  return {
    id: row.id,
    publicId: row.publicId,
    hubId: row.hubId,
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
    cancelReason: row.cancelReason,
    courtIds: row.courts.map(({ court }) => court.id),
    confirmedCount,
    pendingCount,
    waitlistedCount,
    remainingSpots: Math.max(
      0,
      row.capacity - confirmedCount - pendingCount
    ),
    hub: row.hub,
    courts: row.courts.map(({ court }) => court),
    registrations,
    finance: {
      successfulPayments: successfulPayments.length,
      pendingPayments: pendingPayments.length,
      refundedPayments: refundedPayments.length,
      partnerRevenue: successfulPayments.reduce(
        (total, registration) =>
          total + (registration.payment?.venueAmount ?? 0),
        0
      ),
      platformFees: successfulPayments.reduce(
        (total, registration) =>
          total + (registration.payment?.platformFee ?? 0),
        0
      ),
      checkoutSubtotal: successfulPayments.reduce(
        (total, registration) => total + (registration.payment?.amount ?? 0),
        0
      ),
      refundedPartnerRevenue: refundedPayments.reduce(
        (total, registration) =>
          total + (registration.payment?.venueAmount ?? 0),
        0
      ),
    },
  };
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
