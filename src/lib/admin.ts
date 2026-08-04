import "server-only";

import type { PartnerStatus, Role } from "@prisma/client";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/dal";

// Guard: only ADMINs may use the management area. Returns the current admin.
export async function requireAdmin() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
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
  partnerStatus: true,
  partnerActivatedAt: true,
  partnerActivatedById: true,
  skillLevel: true,
  privateProfile: true,
  lastLoginAt: true,
  loginCount: true,
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
  partnerStatus: PartnerStatus | null;
  partnerActivatedAt: Date | null;
  partnerActivatedById: string | null;
  skillLevel: string;
  privateProfile: boolean;
  lastLoginAt: Date | null;
  loginCount: number;
  createdAt: Date;
};

export const ADMIN_USERS_PAGE_SIZE = 20;

export type AdminUsersPage = {
  items: AdminUser[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

export async function listUsers(opts: {
  query?: string;
  role?: Role;
  page: number;
}): Promise<AdminUsersPage> {
  await requireAdmin();
  const { query, role } = opts;
  const where = {
    ...(role ? { role } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            {
              playerName: { contains: query, mode: "insensitive" as const },
            },
            { email: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const total = await prisma.user.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_USERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, opts.page), pageCount);

  const items = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
    take: ADMIN_USERS_PAGE_SIZE,
    select: userListSelect,
  });

  return { items, page, pageCount, pageSize: ADMIN_USERS_PAGE_SIZE, total };
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

export async function pendingPartnerCount(): Promise<number> {
  await requireAdmin();
  return prisma.user.count({
    where: { role: "PARTNER", partnerStatus: "PENDING" },
  });
}

export async function getUserById(id: string): Promise<AdminUser | null> {
  await requireAdmin();
  return prisma.user.findUnique({ where: { id }, select: userListSelect });
}

export async function listPartnerAssistanceAudit(partnerId: string) {
  await requireAdmin();
  const rows = await prisma.partnerImpersonationAudit.findMany({
    where: { partnerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      adminId: true,
      action: true,
      targetType: true,
      targetId: true,
      metadata: true,
      createdAt: true,
    },
  });
  const adminIds = [...new Set(rows.map((row) => row.adminId))];
  const admins = await prisma.user.findMany({
    where: { id: { in: adminIds } },
    select: { id: true, name: true, email: true },
  });
  const adminById = new Map(admins.map((admin) => [admin.id, admin]));

  return rows.map((row) => ({
    ...row,
    admin: adminById.get(row.adminId) ?? null,
  }));
}
