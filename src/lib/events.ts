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
  confirmedGuestNames: string[];
  confirmedSlotCount: number;
  pendingGuestPaymentId: string | null;
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
    paymentMode: "AUTOMATIC" | "MANUAL";
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
  paymentMode: "AUTOMATIC" | "MANUAL";
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
  guestNames: string[];
  pendingGuestNames: string[];
  slotCount: number;
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
    collectionMode: "AUTOMATIC" | "MANUAL";
    manualReceiptImage: string | null;
    manualMethodLabel: string | null;
    manualPaymentRef: string | null;
    manualSubmittedAt: Date | null;
    manualReviewNote: string | null;
  } | null;
  additionalPayments: {
    id: string;
    status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
    amount: number;
    venueAmount: number;
    platformFee: number;
    providerRef: string | null;
    paidAt: Date | null;
    refundedAt: Date | null;
    collectionMode: "AUTOMATIC" | "MANUAL";
    manualReceiptImage: string | null;
    manualMethodLabel: string | null;
    manualPaymentRef: string | null;
    manualSubmittedAt: Date | null;
    manualReviewNote: string | null;
  }[];
};

export type OwnerEventOrganizerGuestView = {
  id: string;
  name: string;
  status: EventRegistrationStatus;
  createdAt: Date;
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
  organizerGuests: OwnerEventOrganizerGuestView[];
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
  guestNames: string[];
  slotCount: number;
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
          partnerPaymentMode: true,
          partnerGateway: { select: { disconnectedAt: true } },
          manualPaymentMethods: {
            where: { active: true },
            take: 1,
            select: { id: true },
          },
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
      payment: { select: { status: true, manualSubmittedAt: true } },
      guests: {
        select: {
          id: true,
          name: true,
          status: true,
          holdExpiresAt: true,
          bookingPaymentId: true,
          payment: {
            select: {
              status: true,
              chargeStartedAt: true,
              providerPaymentId: true,
              manualSubmittedAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
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
  organizerGuests: {
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
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
      ((registration.holdExpiresAt != null && registration.holdExpiresAt > now) ||
        registration.payment?.manualSubmittedAt != null)
  );
  const waitlisted = row.registrations.filter(
    (registration) => registration.status === "WAITLISTED"
  );
  const confirmedGuests = row.registrations.flatMap((registration) =>
    registration.guests.filter((guest) => guest.status === "CONFIRMED")
  );
  const pendingGuests = row.registrations.flatMap((registration) =>
    registration.guests.filter(
      (guest) =>
        guest.status === "PENDING" &&
        ((guest.holdExpiresAt != null && guest.holdExpiresAt > now) ||
          guest.payment?.manualSubmittedAt != null)
    )
  );
  const confirmedOrganizerGuests = row.organizerGuests.filter(
    (guest) => guest.status === "CONFIRMED"
  );
  const confirmedCount =
    confirmed.length + confirmedGuests.length + confirmedOrganizerGuests.length;
  const pendingCount = pending.length + pendingGuests.length;
  const occupied = confirmedCount + pendingCount;
  return {
    confirmed,
    pending,
    waitlisted,
    confirmedGuests,
    confirmedOrganizerGuests,
    pendingGuests,
    confirmedCount,
    pendingCount,
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
    confirmedCount: counts.confirmedCount,
    pendingCount: counts.pendingCount,
    waitlistedCount: counts.waitlisted.length,
    remainingSpots: counts.remaining,
    full: counts.full,
    hub: {
      id: row.hub.id,
      slug: row.hub.slug,
      name: row.hub.name,
      logo: row.hub.logo,
      address: row.hub.address,
      verified:
        row.hub.owner.partnerPaymentMode === "MANUAL"
          ? row.hub.owner.manualPaymentMethods.length > 0
          : row.hub.owner.partnerGateway?.disconnectedAt === null,
      paymentMode: row.hub.owner.partnerPaymentMode,
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
    attendees: [
      ...row.registrations
        .filter((registration) => registration.status === "CONFIRMED")
        .flatMap((registration) => {
          const lead = registration.user.privateProfile
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
              };
          const leadName =
            registration.user.playerName ?? registration.user.name ?? "Player";
          const guests = registration.guests
            .filter((guest) => guest.status === "CONFIRMED")
            .map((guest) => ({
              id: guest.id,
              name: null,
              playerName: registration.user.privateProfile
                ? "Guest player"
                : `Guest of ${leadName}`,
              image: null,
            }));
          return [lead, ...guests];
        }),
      ...row.organizerGuests
        .filter((guest) => guest.status === "CONFIRMED")
        .map((guest) => ({
          id: guest.id,
          name: null,
          playerName: "Guest of organizer",
          image: null,
        })),
    ],
    viewerRegistration: viewer
      ? {
          id: viewer.id,
          status:
            viewer.status === "PENDING" &&
            viewer.holdExpiresAt != null &&
            viewer.holdExpiresAt <= new Date() &&
            viewer.payment?.manualSubmittedAt == null
              ? "EXPIRED"
              : viewer.status,
          holdExpiresAt: viewer.holdExpiresAt,
          paymentId: viewer.bookingPaymentId,
          paymentStatus: viewer.payment?.status ?? null,
          confirmedGuestNames: viewer.guests
            .filter((guest) => guest.status === "CONFIRMED")
            .map((guest) => guest.name),
          confirmedSlotCount:
            (viewer.status === "CONFIRMED" ? 1 : 0) +
            viewer.guests.filter((guest) => guest.status === "CONFIRMED")
              .length,
          pendingGuestPaymentId:
            viewer.guests.find(
              (guest) =>
                (guest.status === "PENDING" || guest.status === "EXPIRED") &&
                guest.payment?.status === "PENDING" &&
                ((guest.holdExpiresAt != null &&
                  guest.holdExpiresAt > new Date()) ||
                  guest.payment.chargeStartedAt != null ||
                  guest.payment.providerPaymentId != null ||
                  guest.payment.manualSubmittedAt != null)
            )?.bookingPaymentId ?? null,
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
  guests: {
    where: { status: "CONFIRMED" as const },
    orderBy: { createdAt: "asc" as const },
    select: { name: true },
  },
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
      manualSubmittedAt: true,
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
    guestNames: row.guests.map((guest) => guest.name),
    slotCount:
      (row.status === "CONFIRMED" ? 1 : 0) + row.guests.length,
    status:
      row.status === "PENDING" &&
      row.holdExpiresAt != null &&
      row.holdExpiresAt <= now &&
      row.payment?.manualSubmittedAt == null
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
          partnerPaymentMode: true,
          manualPaymentMethods: {
            where: { active: true },
            take: 1,
            select: { id: true },
          },
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
    paymentReady:
      row.owner.partnerPaymentMode === "MANUAL"
        ? row.owner.manualPaymentMethods.length > 0
        : row.owner.partnerGateway?.disconnectedAt === null,
    paymentMode: row.owner.partnerPaymentMode,
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
              collectionMode: true,
              manualReceiptImage: true,
              manualMethodLabel: true,
              manualPaymentRef: true,
              manualSubmittedAt: true,
              manualReviewNote: true,
            },
          },
          guests: {
            orderBy: { createdAt: "asc" },
            select: {
              name: true,
              status: true,
              holdExpiresAt: true,
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
                  collectionMode: true,
                  manualReceiptImage: true,
                  manualMethodLabel: true,
                  manualPaymentRef: true,
                  manualSubmittedAt: true,
                  manualReviewNote: true,
                },
              },
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
      registration.holdExpiresAt <= now &&
      registration.payment?.manualSubmittedAt == null
        ? "EXPIRED"
        : registration.status,
    createdAt: registration.createdAt,
    guestNames: registration.guests
      .filter((guest) => guest.status === "CONFIRMED")
      .map((guest) => guest.name),
    pendingGuestNames: registration.guests
      .filter(
        (guest) =>
          guest.status === "PENDING" &&
          ((guest.holdExpiresAt != null && guest.holdExpiresAt > now) ||
            guest.payment?.manualSubmittedAt != null)
      )
      .map((guest) => guest.name),
    slotCount:
      (registration.status === "CONFIRMED" ||
      (registration.status === "PENDING" &&
        ((registration.holdExpiresAt != null && registration.holdExpiresAt > now) ||
          registration.payment?.manualSubmittedAt != null))
        ? 1
        : 0) +
      registration.guests.filter(
        (guest) =>
          guest.status === "CONFIRMED" ||
          (guest.status === "PENDING" &&
            ((guest.holdExpiresAt != null && guest.holdExpiresAt > now) ||
              guest.payment?.manualSubmittedAt != null))
      ).length,
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
          collectionMode: registration.payment.collectionMode,
          manualReceiptImage: registration.payment.manualReceiptImage,
          manualMethodLabel: registration.payment.manualMethodLabel,
          manualPaymentRef: registration.payment.manualPaymentRef,
          manualSubmittedAt: registration.payment.manualSubmittedAt,
          manualReviewNote: registration.payment.manualReviewNote,
        }
      : null,
    additionalPayments: Array.from(
      new Map(
        registration.guests
          .flatMap((guest) => (guest.payment ? [guest.payment] : []))
          .filter((payment) => payment.id !== registration.payment?.id)
          .map((payment) => [payment.id, payment])
      ).values()
    ).map((payment) => ({
      id: payment.id,
      status: payment.status,
      amount: Number(payment.amount),
      venueAmount: Number(payment.venueAmount),
      platformFee: Number(payment.platformFee),
      providerRef: payment.providerRef,
      paidAt: payment.paidAt,
      refundedAt: payment.refundedAt,
      collectionMode: payment.collectionMode,
      manualReceiptImage: payment.manualReceiptImage,
      manualMethodLabel: payment.manualMethodLabel,
      manualPaymentRef: payment.manualPaymentRef,
      manualSubmittedAt: payment.manualSubmittedAt,
      manualReviewNote: payment.manualReviewNote,
    })),
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
              collectionMode: true,
              manualReceiptImage: true,
              manualMethodLabel: true,
              manualPaymentRef: true,
              manualSubmittedAt: true,
              manualReviewNote: true,
            },
          },
          guests: {
            orderBy: { createdAt: "asc" },
            select: {
              name: true,
              status: true,
              holdExpiresAt: true,
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
                  collectionMode: true,
                  manualReceiptImage: true,
                  manualMethodLabel: true,
                  manualPaymentRef: true,
                  manualSubmittedAt: true,
                  manualReviewNote: true,
                },
              },
            },
          },
        },
      },
      organizerGuests: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
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
        registration.holdExpiresAt <= now &&
        registration.payment?.manualSubmittedAt == null
          ? "EXPIRED"
          : registration.status,
      createdAt: registration.createdAt,
      guestNames: registration.guests
        .filter((guest) => guest.status === "CONFIRMED")
        .map((guest) => guest.name),
      pendingGuestNames: registration.guests
        .filter(
          (guest) =>
            guest.status === "PENDING" &&
            ((guest.holdExpiresAt != null && guest.holdExpiresAt > now) ||
              guest.payment?.manualSubmittedAt != null)
        )
        .map((guest) => guest.name),
      slotCount:
        (registration.status === "CONFIRMED" ||
        (registration.status === "PENDING" &&
          ((registration.holdExpiresAt != null && registration.holdExpiresAt > now) ||
            registration.payment?.manualSubmittedAt != null))
          ? 1
          : 0) +
        registration.guests.filter(
          (guest) =>
            guest.status === "CONFIRMED" ||
            (guest.status === "PENDING" &&
              ((guest.holdExpiresAt != null && guest.holdExpiresAt > now) ||
                guest.payment?.manualSubmittedAt != null))
        ).length,
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
            collectionMode: registration.payment.collectionMode,
            manualReceiptImage: registration.payment.manualReceiptImage,
            manualMethodLabel: registration.payment.manualMethodLabel,
            manualPaymentRef: registration.payment.manualPaymentRef,
            manualSubmittedAt: registration.payment.manualSubmittedAt,
            manualReviewNote: registration.payment.manualReviewNote,
        }
        : null,
      additionalPayments: Array.from(
        new Map(
          registration.guests
            .flatMap((guest) => (guest.payment ? [guest.payment] : []))
            .filter((payment) => payment.id !== registration.payment?.id)
            .map((payment) => [payment.id, payment])
        ).values()
      ).map((payment) => ({
        id: payment.id,
        status: payment.status,
        amount: Number(payment.amount),
        venueAmount: Number(payment.venueAmount),
        platformFee: Number(payment.platformFee),
        providerRef: payment.providerRef,
        paidAt: payment.paidAt,
        refundedAt: payment.refundedAt,
        collectionMode: payment.collectionMode,
        manualReceiptImage: payment.manualReceiptImage,
        manualMethodLabel: payment.manualMethodLabel,
        manualPaymentRef: payment.manualPaymentRef,
        manualSubmittedAt: payment.manualSubmittedAt,
        manualReviewNote: payment.manualReviewNote,
      })),
    })
  );
  const organizerGuests: OwnerEventOrganizerGuestView[] =
    row.organizerGuests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      status: guest.status,
      createdAt: guest.createdAt,
    }));
  const confirmedCount =
    registrations.reduce(
      (total, registration) =>
        total +
        (registration.status === "CONFIRMED" ? 1 : 0) +
        registration.guestNames.length,
      0
    ) +
    organizerGuests.filter((guest) => guest.status === "CONFIRMED").length;
  const pendingCount = registrations.reduce(
    (total, registration) =>
      total +
      (registration.status === "PENDING" ? 1 : 0) +
      registration.pendingGuestNames.length,
    0
  );
  const waitlistedCount = registrations.filter(
    (registration) => registration.status === "WAITLISTED"
  ).length;
  const payments = Array.from(
    new Map(
      registrations
        .flatMap((registration) => [
          ...(registration.payment ? [registration.payment] : []),
          ...registration.additionalPayments,
        ])
        .map((payment) => [payment.id, payment])
    ).values()
  );
  const successfulPayments = payments.filter(
    (payment) => payment.status === "SUCCEEDED"
  );
  const pendingPayments = payments.filter(
    (payment) => payment.status === "PENDING"
  );
  const refundedPayments = payments.filter(
    (payment) => payment.status === "REFUNDED"
  );
  const feeBearingPayments = [...successfulPayments, ...refundedPayments];

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
    organizerGuests,
    finance: {
      successfulPayments: successfulPayments.length,
      pendingPayments: pendingPayments.length,
      refundedPayments: refundedPayments.length,
      partnerRevenue: successfulPayments.reduce(
        (total, payment) => total + payment.venueAmount,
        0
      ),
      platformFees: feeBearingPayments.reduce(
        (total, payment) => total + payment.platformFee,
        0
      ),
      checkoutSubtotal: successfulPayments.reduce(
        (total, payment) => total + payment.amount,
        0
      ),
      refundedPartnerRevenue: refundedPayments.reduce(
        (total, payment) => total + payment.venueAmount,
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
