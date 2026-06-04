import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { OperatingHours, Game } from "@/lib/constants";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/dal";

// Hubs are a partner-only feature. Returns the current partner, or redirects.
export async function requirePartner() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PARTNER") {
    redirect("/dashboard");
  }
  return user;
}

export type Hub = {
  id: string;
  name: string;
  about: string | null;
  logo: string | null;
  coverPhotos: string[];
  games: string[];
  phone: string | null;
  email: string | null;
  operatingHours: OperatingHours | null;
  createdAt: Date;
};

const hubSelect = {
  id: true,
  name: true,
  about: true,
  logo: true,
  coverPhotos: true,
  games: true,
  phone: true,
  email: true,
  operatingHours: true,
  createdAt: true,
} as const;

export async function listMyHubs(): Promise<Hub[]> {
  const partner = await requirePartner();
  const rows = await prisma.hub.findMany({
    where: { ownerId: partner.id },
    orderBy: { createdAt: "desc" },
    select: hubSelect,
  });
  return rows.map((r) => ({
    ...r,
    operatingHours: (r.operatingHours as OperatingHours | null) ?? null,
  }));
}

// Public directory of all hubs, optionally filtered by game. No auth.
export async function listPublicHubs(
  opts: { game?: Game } = {}
): Promise<Hub[]> {
  const rows = await prisma.hub.findMany({
    where: opts.game ? { games: { has: opts.game } } : {},
    orderBy: { createdAt: "desc" },
    select: hubSelect,
  });
  return rows.map((r) => ({
    ...r,
    operatingHours: (r.operatingHours as OperatingHours | null) ?? null,
  }));
}

// Public hub profile (no auth, not owner-scoped). Memoized per request so the
// page and its metadata share a single query.
export const getPublicHub = cache(
  async (id: string): Promise<Hub | null> => {
    const row = await prisma.hub.findUnique({
      where: { id },
      select: hubSelect,
    });
    if (!row) return null;
    return {
      ...row,
      operatingHours: (row.operatingHours as OperatingHours | null) ?? null,
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
  return {
    ...row,
    operatingHours: (row.operatingHours as OperatingHours | null) ?? null,
  };
}
