import "server-only";

import { cache } from "react";
import { Prisma } from "@prisma/client";
import type { OperatingHours, Game } from "@/lib/constants";

import { prisma } from "@/lib/db";
import { requirePartner } from "@/lib/dal";
import {
  entitledSubscriptionWhere,
  isEntitled,
  sweepDueSubscriptions,
} from "@/lib/billing";

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

// Hubs are a partner-only feature. The guard itself lives in dal.ts (so
// billing.ts can use it without an import cycle) and is re-exported here for
// every existing caller.
export { requirePartner };

export type Hub = {
  id: string;
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
};

const hubSelect = {
  id: true,
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
  const partner = await requirePartner();
  const rows = await prisma.hub.findMany({
    where: { ownerId: partner.id },
    orderBy: { createdAt: "desc" },
    select: hubSelect,
  });
  return rows.map(mapHub);
}

// Pulls forward card renewals so they happen without anyone signing in.
// Throttled per server instance, never allowed to break the page, and
// deliberately NOT load-bearing: listing correctness comes from the time-based
// entitlement filter below, not from this. Delete it once a real cron calls
// /api/billing/sweep.
let lastSweepAt = 0;
async function maybeSweep(): Promise<void> {
  if (Date.now() - lastSweepAt < 60_000) return;
  lastSweepAt = Date.now();
  try {
    await sweepDueSubscriptions({ limit: 25 });
  } catch {
    // Never break a public page over billing housekeeping.
  }
}

// Public directory of all hubs, optionally filtered by game. No auth.
//
// A venue is listed publicly only when BOTH are true: the partner's
// subscription entitles them, and they have a payment gateway connected. A hub
// that can't take a payment isn't ready for players to find.
//
// Note these are nested filters on nullable to-ones, which mean "the row EXISTS
// and matches" — so a partner with no subscription and no gateway is excluded
// rather than defaulting in. That is exactly why existing partners are
// backfilled in prisma/seed.mjs.
export async function listPublicHubs(
  opts: { game?: Game } = {}
): Promise<Hub[]> {
  await maybeSweep();
  const rows = await prisma.hub.findMany({
    where: {
      ...(opts.game ? { games: { has: opts.game } } : {}),
      owner: {
        subscription: entitledSubscriptionWhere(new Date()),
        partnerGateway: { disconnectedAt: null },
      },
    },
    orderBy: { createdAt: "desc" },
    select: hubSelect,
  });
  return rows.map(mapHub);
}

const publicHubSelect = {
  ...hubSelect,
  // Just enough to tell the owner apart from a visitor, so the page can
  // explain an unlisted hub to the one person who can fix it.
  ownerId: true,
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
  blockedBy: "subscription" | "gateway" | null;
  ownerId: string;
};

// Public hub profile (no auth, not owner-scoped). Memoized per request so the
// page and its metadata share a single query. cache() here is React
// per-render memoization only — nothing lands in the Next Data Cache, so there
// is no tag to revalidate.
export const getPublicHub = cache(
  async (id: string): Promise<PublicHub | null> => {
    const row = await prisma.hub.findUnique({
      where: { id },
      select: publicHubSelect,
    });
    if (!row) return null;
    const { owner, ownerId, ...rest } = row;
    const entitled = isEntitled(owner.subscription);
    const connected = owner.partnerGateway?.disconnectedAt === null;
    return {
      ...mapHub(rest),
      // Both, and in that order: an unpaid subscription is the more urgent
      // thing to tell a partner about.
      bookable: entitled && connected,
      paymentRequired: connected,
      blockedBy: !entitled ? "subscription" : !connected ? "gateway" : null,
      ownerId,
    };
  }
);

// Fetches one hub, scoped to the current partner (ownership enforced).
export async function getMyHub(id: string): Promise<Hub | null> {
  const partner = await requirePartner();
  const row = await prisma.hub.findFirst({
    where: { id, ownerId: partner.id },
    select: hubSelect,
  });
  if (!row) return null;
  return mapHub(row);
}
