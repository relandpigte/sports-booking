import "server-only";

import { cache } from "react";
import { Prisma } from "@prisma/client";
import type {
  CourtType,
  Game,
  OperatingHours,
} from "@/lib/constants";

import { prisma } from "@/lib/db";
import { requireActivePartner, requirePartner } from "@/lib/dal";
import { isServiceFeeOverdue } from "@/lib/service-fees";
import { buildSlots, weekdayIndexForDate } from "@/lib/slots";
import type { CourtScheduleRule } from "@/lib/slots";
import { manilaNowHour, manilaToday } from "@/lib/time";

export type Court = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
  scheduleRules: CourtScheduleRule[];
};

type CourtRow = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: Prisma.Decimal | null;
  scheduleRules: {
    weekday: number;
    hour: number;
    closed: boolean;
    closureReason: string | null;
    hourlyRate: Prisma.Decimal | null;
  }[];
};

function mapCourt(c: CourtRow): Court {
  return {
    id: c.id,
    name: c.name,
    courtType: c.courtType,
    hourlyRate: c.hourlyRate ? c.hourlyRate.toNumber() : null,
    scheduleRules: c.scheduleRules.map((rule) => ({
      weekday: rule.weekday,
      hour: rule.hour,
      closed: rule.closed,
      closureReason: rule.closureReason,
      hourlyRate: rule.hourlyRate ? rule.hourlyRate.toNumber() : null,
    })),
  };
}

// Re-export the guards for existing domain callers.
export { requireActivePartner, requirePartner };

export type Hub = {
  id: string;
  slug: string | null;
  name: string;
  about: string | null;
  logo: string | null;
  coverPhotos: string[];
  games: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  operatingHours: OperatingHours | null;
  courts: Court[];
  createdAt: Date;
  updatedAt: Date;
};

const hubSelect = {
  id: true,
  slug: true,
  name: true,
  about: true,
  logo: true,
  coverPhotos: true,
  games: true,
  address: true,
  latitude: true,
  longitude: true,
  phone: true,
  email: true,
  operatingHours: true,
  createdAt: true,
  updatedAt: true,
  courts: {
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
    orderBy: { createdAt: "asc" },
  },
} as const;

// Maps a Prisma hub row to the app Hub type (JSON hours + Decimal rates).
function mapHub<
  T extends {
    operatingHours: Prisma.JsonValue;
    courts: CourtRow[];
  }
>(row: T): Omit<T, "operatingHours" | "courts"> & {
  operatingHours: OperatingHours | null;
  courts: Court[];
} {
  return {
    ...row,
    operatingHours: (row.operatingHours as OperatingHours | null) ?? null,
    courts: row.courts.map(mapCourt),
  };
}

export async function listMyHubs(): Promise<Hub[]> {
  const partner = await requireActivePartner();
  const rows = await prisma.hub.findMany({
    where: { ownerId: partner.id },
    orderBy: { createdAt: "desc" },
    select: hubSelect,
  });
  return rows.map(mapHub);
}

export type ListedHub = Hub & {
  bookable: boolean;
  comingSoon: boolean;
  verified: boolean;
};

// Public directory of all complete hubs owned by approved partners. No auth.
// A connected, current PayMongo account makes the venue bookable and verified;
// otherwise it stays discoverable as Coming soon. Overdue connected partners
// remain hidden until their service-fee standing is current again.
export async function listPublicHubs(
  opts: { game?: Game } = {}
): Promise<ListedHub[]> {
  const rows = await prisma.hub.findMany({
    where: {
      ...(opts.game ? { games: { has: opts.game } } : {}),
      courts: { some: {} },
      owner: {
        role: "PARTNER",
        partnerStatus: "ACTIVE",
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      ...hubSelect,
      ownerId: true,
      owner: {
        select: {
          partnerGateway: { select: { disconnectedAt: true } },
        },
      },
    },
  });
  const connectedOwnerIds = [
    ...new Set(
      rows
        .filter(
          (row) => row.owner.partnerGateway?.disconnectedAt === null
        )
        .map((row) => row.ownerId)
    ),
  ];
  const overdueByOwner = new Map(
    await Promise.all(
      connectedOwnerIds.map(async (ownerId) =>
        [ownerId, await isServiceFeeOverdue(ownerId)] as const
      )
    )
  );
  return rows
    .filter((row) => {
      const connected = row.owner.partnerGateway?.disconnectedAt === null;
      return !connected || !overdueByOwner.get(row.ownerId);
    })
    .map(({ ownerId: _ownerId, owner, ...row }) => {
      const connected = owner.partnerGateway?.disconnectedAt === null;
      return {
        ...mapHub(row),
        bookable: connected,
        comingSoon: !connected,
        verified: connected,
      };
    });
}

export type DirectoryHub = ListedHub & {
  availableSlots: number | null;
};

// Bookable venues use the exact slot math from the booking page. Coming-soon
// venues stay visible without exposing an availability count, unless a player
// explicitly filters for a time window they cannot yet reserve.
export async function listPublicHubDirectory({
  game,
  courtType,
  date,
  fromHour,
  toHour,
}: {
  game?: Game;
  courtType?: CourtType;
  date?: string;
  fromHour?: number;
  toHour?: number;
} = {}): Promise<DirectoryHub[]> {
  const hubs = await listPublicHubs({ game });
  const typed = hubs
    .map((hub) => ({
      ...hub,
      courts: courtType
        ? hub.courts.filter((court) => court.courtType === courtType)
        : hub.courts,
    }))
    .filter((hub) => hub.courts.length > 0);

  if (!date) {
    return typed.map((hub) => ({ ...hub, availableSlots: null }));
  }

  const courtIds = typed.filter((hub) => hub.bookable).flatMap((hub) =>
    hub.courts.map((court) => court.id)
  );
  const now = new Date();
  const occupied = courtIds.length
    ? await prisma.bookingSlot.findMany({
        where: {
          courtId: { in: courtIds },
          date,
          OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
        },
        select: { courtId: true, hour: true },
      })
    : [];
  const bookedByCourt = new Map<string, number[]>();
  for (const slot of occupied) {
    const hours = bookedByCourt.get(slot.courtId) ?? [];
    hours.push(slot.hour);
    bookedByCourt.set(slot.courtId, hours);
  }

  const today = manilaToday();
  const nowHour = manilaNowHour();

  return typed
    .map((hub) => {
      if (!hub.bookable) {
        return { ...hub, availableSlots: null };
      }

      let availableSlots = 0;

      if (fromHour == null || toHour == null) {
        for (const court of hub.courts) {
          const { slots } = buildSlots({
            operatingHours: hub.operatingHours,
            date,
            bookedHours: bookedByCourt.get(court.id) ?? [],
            today,
            nowHour,
            courtHourlyRate: court.hourlyRate,
            scheduleRules: court.scheduleRules,
          });
          availableSlots += slots.filter((slot) => slot.available).length;
        }

        // Keep otherwise bookable venues discoverable even when today's
        // inventory is already full. The card truthfully displays zero slots
        // instead of making the marketplace look empty.
        return { ...hub, availableSlots };
      }

      const matchingCourts = hub.courts.filter((court) => {
        const { slots } = buildSlots({
          operatingHours: hub.operatingHours,
          date,
          bookedHours: bookedByCourt.get(court.id) ?? [],
          today,
          nowHour,
          courtHourlyRate: court.hourlyRate,
          scheduleRules: court.scheduleRules,
        });
        const courtAvailableSlots = slots.filter(
          (slot) => slot.available
        ).length;

        for (let hour = fromHour; hour < toHour; hour++) {
          if (!slots.some((slot) => slot.hour === hour && slot.available)) {
            return false;
          }
        }
        availableSlots += courtAvailableSlots;
        return true;
      });

      return { ...hub, courts: matchingCourts, availableSlots };
    })
    .filter((hub) => {
      if (hub.courts.length === 0) return false;
      if (fromHour == null || toHour == null) return true;
      return hub.bookable && (hub.availableSlots ?? 0) > 0;
    });
}

const publicHubSelect = {
  ...hubSelect,
  // Just enough to tell the owner apart from a visitor, so the page can
  // explain an unlisted hub to the one person who can fix it.
  ownerId: true,
  owner: {
    select: {
      partnerStatus: true,
      // Only whether one is connected. Nothing secret is selected — see the
      // comment on GatewayView.
      partnerGateway: { select: { disconnectedAt: true } },
    },
  },
} as const;

// A hub that isn't taking bookings still renders. Complete, approved hubs with
// no gateway appear publicly as Coming soon; other blocked hubs remain
// available by direct link to their owner, with no booking controls.
export type PublicHub = Hub & {
  bookable: boolean;
  publiclyListed: boolean;
  comingSoon: boolean;
  verified: boolean;
  // Whether booking here holds the hours pending payment. Now implied by
  // bookable — a hub with no gateway takes no bookings at all — but kept
  // separate because it answers a different question for the booking panel.
  paymentRequired: boolean;
  // Why it isn't bookable, so the page can say something true rather than a
  // vague "not right now".
  blockedBy: "approval" | "gateway" | "setup" | "settlement" | null;
  ownerId: string;
};

// Public hub profile (no auth, not owner-scoped). Memoized per request so the
// page and its metadata share a single query. cache() here is React
// per-render memoization only — nothing lands in the Next Data Cache, so there
// is no tag to revalidate.
export const getPublicHub = cache(
  async (id: string): Promise<PublicHub | null> => {
    const row = await prisma.hub.findFirst({
      where: { OR: [{ slug: id }, { id }] },
      select: publicHubSelect,
    });
    if (!row) return null;
    const { owner, ownerId, ...rest } = row;
    const approved = owner.partnerStatus === "ACTIVE";
    const connected = owner.partnerGateway?.disconnectedAt === null;
    const setupComplete = rest.courts.length > 0;
    const overdue =
      approved && connected ? await isServiceFeeOverdue(ownerId) : false;
    const bookable = approved && connected && setupComplete && !overdue;
    const comingSoon = approved && !connected && setupComplete;
    return {
      ...mapHub(rest),
      bookable,
      publiclyListed: bookable || comingSoon,
      comingSoon,
      verified: bookable,
      paymentRequired: bookable,
      blockedBy: !approved
        ? "approval"
        : !connected
          ? "gateway"
          : !setupComplete
            ? "setup"
            : overdue
              ? "settlement"
              : null,
      ownerId,
    };
  }
);

// Fetches one hub, scoped to the current partner (ownership enforced).
export async function getMyHub(id: string): Promise<Hub | null> {
  const partner = await requireActivePartner();
  const row = await prisma.hub.findFirst({
    where: { id, ownerId: partner.id },
    select: hubSelect,
  });
  if (!row) return null;
  return mapHub(row);
}

export type LockedCourtScheduleSlot = {
  courtId: string;
  weekday: number;
  hour: number;
};

// Recurring hours with at least one upcoming booking are locked in the weekly
// editor. Rate changes remain safe because Booking snapshots its price, but a
// partner must cancel/move the booking before closing that recurring hour.
export async function getMyHubSchedule(id: string): Promise<{
  hub: Hub;
  lockedSlots: LockedCourtScheduleSlot[];
} | null> {
  const hub = await getMyHub(id);
  if (!hub) return null;

  const now = new Date();
  const rows = await prisma.bookingSlot.findMany({
    where: {
      courtId: { in: hub.courts.map((court) => court.id) },
      OR: [
        { booking: { status: "CONFIRMED", endsAt: { gte: now } } },
        {
          booking: {
            status: "PENDING",
            holdExpiresAt: { gt: now },
          },
        },
      ],
    },
    select: { courtId: true, date: true, hour: true },
  });

  const unique = new Map<string, LockedCourtScheduleSlot>();
  for (const row of rows) {
    const slot = {
      courtId: row.courtId,
      weekday: weekdayIndexForDate(row.date),
      hour: row.hour,
    };
    unique.set(`${slot.courtId}:${slot.weekday}:${slot.hour}`, slot);
  }

  return { hub, lockedSlots: [...unique.values()] };
}
