import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  DUPR_BATCH_LIMIT,
  fetchDuprUsers,
  readPartnerConfig,
  readSsoConfig,
  verifyDuprConsent,
  type DuprPlayer,
} from "@/lib/dupr";
import type { DuprRatingView } from "@/lib/dupr-shared";

type Fetcher = typeof fetch;

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type DuprLinkResult =
  | { status: "linked"; player: DuprPlayer }
  | { status: "unavailable" | "not-verified" | "taken" };

// The rating fields every display surface selects.
export const duprRatingSelect = {
  duprId: true,
  doubles: true,
  singles: true,
  doublesReliable: true,
  singlesReliable: true,
} as const;

function decimal(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(value.toFixed(3));
}

function ratingData(player: DuprPlayer) {
  return {
    fullName: player.fullName.slice(0, 160),
    singles: decimal(player.singles),
    doubles: decimal(player.doubles),
    singlesReliable: player.singlesReliable,
    doublesReliable: player.doublesReliable,
    ratingsUpdatedAt: new Date(),
    consentLostAt: null,
  };
}

// Turns a stored link into the plain numbers the UI renders.
export function toDuprRatingView(
  link: {
    duprId: string;
    doubles: Prisma.Decimal | null;
    singles: Prisma.Decimal | null;
    doublesReliable: boolean;
    singlesReliable: boolean;
  } | null
): DuprRatingView | null {
  if (!link) return null;
  return {
    duprId: link.duprId,
    doubles: link.doubles == null ? null : Number(link.doubles),
    singles: link.singles == null ? null : Number(link.singles),
    doublesReliable: link.doublesReliable,
    singlesReliable: link.singlesReliable,
  };
}

// Links a DUPR account reported by DUPR's consent page to a Bunal.club user,
// after confirming with DUPR that the player consented. Re-linking the same
// DUPR ID refreshes it; a DUPR ID already linked elsewhere is refused.
export async function linkDuprAccount(
  input: { userId: string; duprId: string },
  fetcher: Fetcher = fetch
): Promise<DuprLinkResult> {
  const config = readPartnerConfig();
  if (!config || !readSsoConfig()) return { status: "unavailable" };

  const player = await verifyDuprConsent(config, input.duprId, fetcher);
  if (!player) return { status: "not-verified" };

  try {
    await prisma.duprLink.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        duprId: player.duprId,
        ...ratingData(player),
      },
      update: {
        duprId: player.duprId,
        connectedAt: new Date(),
        ...ratingData(player),
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { status: "taken" };
    }
    throw error;
  }
  return { status: "linked", player };
}

export async function unlinkDuprAccount(userId: string): Promise<boolean> {
  const removed = await prisma.duprLink.deleteMany({ where: { userId } });
  return removed.count > 0;
}

export async function getDuprLinkForUser(userId: string) {
  return prisma.duprLink.findUnique({
    where: { userId },
    select: {
      ...duprRatingSelect,
      fullName: true,
      consentLostAt: true,
      ratingsUpdatedAt: true,
    },
  });
}

// Called by the hourly sweep. Refreshes ratings older than a day, oldest
// first. A player DUPR no longer returns (consent withdrawn) keeps the link
// but is marked so the account page can explain why it stopped updating.
export async function refreshDuprRatings(
  { limit = 500 }: { limit?: number } = {},
  fetcher: Fetcher = fetch
): Promise<{ refreshed: number; consentLost: number }> {
  const config = readPartnerConfig();
  if (!config) return { refreshed: 0, consentLost: 0 };

  const stale = await prisma.duprLink.findMany({
    where: { ratingsUpdatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    orderBy: { ratingsUpdatedAt: "asc" },
    take: limit,
    select: { id: true, duprId: true },
  });
  let refreshed = 0;
  let consentLost = 0;

  for (let start = 0; start < stale.length; start += DUPR_BATCH_LIMIT) {
    const chunk = stale.slice(start, start + DUPR_BATCH_LIMIT);
    const { users } = await fetchDuprUsers(
      config,
      chunk.map((link) => link.duprId),
      fetcher
    );
    const byId = new Map(users.map((user) => [user.duprId, user]));
    for (const link of chunk) {
      const player = byId.get(link.duprId);
      if (player) {
        await prisma.duprLink.update({
          where: { id: link.id },
          data: ratingData(player),
        });
        refreshed++;
      } else {
        // Checked again tomorrow, so a temporary DUPR gap self-heals.
        await prisma.duprLink.update({
          where: { id: link.id },
          data: { consentLostAt: new Date(), ratingsUpdatedAt: new Date() },
        });
        consentLost++;
      }
    }
  }
  return { refreshed, consentLost };
}

// Leaderboard rows link to a Bunal.club profile when the DUPR player has
// connected an account with a public profile and a username.
export async function profilePathsForDuprIds(
  duprIds: string[]
): Promise<Map<string, string>> {
  if (duprIds.length === 0) return new Map();
  const links = await prisma.duprLink.findMany({
    where: {
      duprId: { in: duprIds },
      user: { username: { not: null }, privateProfile: false },
    },
    select: { duprId: true, user: { select: { username: true } } },
  });
  return new Map(
    links.flatMap((link) =>
      link.user.username
        ? [[link.duprId, `/players/${link.user.username}`] as const]
        : []
    )
  );
}

// The hourly sweep's entry point. DUPR being down must never fail the sweep,
// which also reaps holds and creates payouts, so errors are logged and the
// stale links are simply retried next hour.
export async function sweepDuprRatings(): Promise<{
  refreshed: number;
  consentLost: number;
  failed?: true;
}> {
  try {
    return await refreshDuprRatings();
  } catch (error) {
    console.error(
      "DUPR rating refresh failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return { refreshed: 0, consentLost: 0, failed: true };
  }
}
