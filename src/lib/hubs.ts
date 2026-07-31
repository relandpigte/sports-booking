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
import { buildSlots } from "@/lib/slots";
import { manilaNowHour, manilaToday } from "@/lib/time";

export type Court = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
};

type CourtRow = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: Prisma.Decimal | null;
};

function mapCourt(c: CourtRow): Court {
  return {
    id: c.id,
    name: c.name,
    courtType: c.courtType,
    hourlyRate: c.hourlyRate ? c.hourlyRate.toNumber() : null,
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
    select: { id: true, name: true, courtType: true, hourlyRate: true },
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

// Public directory of all hubs, optionally filtered by game. No auth.
//
// A venue is listed only after the partner is admin-approved and has connected
// a payment gateway. There is no plan or subscription gate.
export async function listPublicHubs(
  opts: { game?: Game } = {}
): Promise<Hub[]> {
  const rows = await prisma.hub.findMany({
    where: {
      ...(opts.game ? { games: { has: opts.game } } : {}),
      courts: { some: {} },
      owner: {
        role: "PARTNER",
        partnerStatus: "ACTIVE",
        partnerGateway: { disconnectedAt: null },
      },
    },
    orderBy: { createdAt: "desc" },
    select: { ...hubSelect, ownerId: true },
  });
  const overdueByOwner = new Map(
    await Promise.all(
      [...new Set(rows.map((row) => row.ownerId))].map(
        async (ownerId) =>
          [ownerId, await isServiceFeeOverdue(ownerId)] as const
      )
    )
  );
  return rows
    .filter((row) => !overdueByOwner.get(row.ownerId))
    .map(({ ownerId: _ownerId, ...row }) => mapHub(row));
}

export type DirectoryHub = Hub & {
  availableSlots: number | null;
};

// The public directory can narrow venues to a real bookable window. It starts
// from the same approved/connected/current hub list as the normal directory,
// then evaluates each court with the exact slot math used by the booking page.
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

  const courtIds = typed.flatMap((hub) =>
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
      let availableSlots = 0;

      if (fromHour == null || toHour == null) {
        for (const court of hub.courts) {
          const { slots } = buildSlots({
            operatingHours: hub.operatingHours,
            date,
            bookedHours: bookedByCourt.get(court.id) ?? [],
            today,
            nowHour,
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
    .filter((hub) =>
      fromHour == null || toHour == null
        ? hub.courts.length > 0
        : hub.courts.length > 0 && hub.availableSlots > 0
    );
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

// A hub that isn't taking bookings still RENDERS — the requirement is "no new
// bookings", not "vanish", and the partner's own View link must keep working.
// It simply doesn't appear in the directory (see listPublicHubs) and its
// booking panel is replaced by an explanation.
export type PublicHub = Hub & {
  bookable: boolean;
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
    return {
      ...mapHub(rest),
      bookable,
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
