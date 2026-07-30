import "server-only";

import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/dal";

// Guard: only ADMINs may use the management area. Returns the current admin.
export async function requireAdmin() {
  return requireRole("ADMIN");
}

const userListSelect = {
  id: true,
  name: true,
  playerName: true,
  email: true,
  phone: true,
  facebookPage: true,
  image: true,
  role: true,
  skillLevel: true,
  privateProfile: true,
  createdAt: true,
} as const;

export type AdminUser = {
  id: string;
  name: string | null;
  playerName: string | null;
  email: string;
  phone: string | null;
  facebookPage: string | null;
  image: string | null;
  role: Role;
  skillLevel: string;
  privateProfile: boolean;
  createdAt: Date;
};

export async function listUsers(opts: {
  query?: string;
  role?: Role;
}): Promise<AdminUser[]> {
  await requireAdmin();
  const { query, role } = opts;

  return prisma.user.findMany({
    where: {
      ...(role ? { role } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { playerName: { contains: query, mode: "insensitive" } },
              { email: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    select: userListSelect,
  });
}

export async function userCounts(): Promise<Record<Role, number>> {
  await requireAdmin();
  const grouped = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });

  const counts: Record<Role, number> = { ADMIN: 0, PLAYER: 0, PARTNER: 0 };
  for (const row of grouped) {
    counts[row.role] = row._count._all;
  }
  return counts;
}

export async function getUserById(id: string): Promise<AdminUser | null> {
  await requireAdmin();
  return prisma.user.findUnique({ where: { id }, select: userListSelect });
}
