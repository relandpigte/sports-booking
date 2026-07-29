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
// Only hubs whose owner has an entitled subscription are listed. Note this is a
// nested filter on a nullable to-one, which means "a subscription EXISTS and
// matches" — so a partner with no subscription row at all is excluded. That is
// exactly why existing partners are backfilled in prisma/seed.mjs.
export async function listPublicHubs(
  opts: { game?: Game } = {}
): Promise<Hub[]> {
  await maybeSweep();
  const rows = await prisma.hub.findMany({
    where: {
      ...(opts.game ? { games: { has: opts.game } } : {}),
      owner: { subscription: entitledSubscriptionWhere(new Date()) },
    },
    orderBy: { createdAt: "desc" },
    select: hubSelect,
  });
  return rows.map(mapHub);
}

const publicHubSelect = {
  ...hubSelect,
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
export type PublicHub = Hub & {
  bookable: boolean;
  // Whether booking here holds the hours pending payment, or confirms them
  // outright as it always has.
  paymentRequired: boolean;
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
    const { owner, ...rest } = row;
    return {
      ...mapHub(rest),
      bookable: isEntitled(owner.subscription),
      paymentRequired: owner.partnerGateway?.disconnectedAt === null,
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
