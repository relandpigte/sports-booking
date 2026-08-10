import "server-only";

import type { Prisma, Role } from "@prisma/client";
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
  partnerGateway: { select: { id: true } },
  _count: {
    select: {
      hubs: true,
      bookings: true,
      bookingPayments: true,
      venuePayments: true,
      eventRegistrations: true,
      organizerEventGuests: true,
      manualPaymentMethods: true,
      serviceFeeEntries: true,
      serviceFeeSettlements: true,
    },
  },
} as const;

type AdminUserRecord = Prisma.UserGetPayload<{
  select: typeof userListSelect;
}>;

export type AdminUser = Omit<AdminUserRecord, "partnerGateway" | "_count"> & {
  deleteBlockedReason: string | null;
};

function mapAdminUser(user: AdminUserRecord): AdminUser {
  const { partnerGateway, _count, ...safeUser } = user;
  if (user.partnerStatus === "ACTIVE") {
    return {
      ...safeUser,
      deleteBlockedReason: "Deactivate this partner before deleting the account.",
    };
  }
  const hasPartnerOwnedHistory =
    partnerGateway !== null ||
    _count.hubs > 0 ||
    _count.venuePayments > 0 ||
    _count.organizerEventGuests > 0 ||
    _count.manualPaymentMethods > 0 ||
    _count.serviceFeeEntries > 0 ||
    _count.serviceFeeSettlements > 0;
  const hasPartnerAccountHistory =
    hasPartnerOwnedHistory ||
    _count.bookings > 0 ||
    _count.bookingPayments > 0 ||
    _count.eventRegistrations > 0;
  return {
    ...safeUser,
    deleteBlockedReason:
      hasPartnerOwnedHistory ||
      (user.role === "PARTNER" && hasPartnerAccountHistory)
      ? "This partner has venue, booking, payment, or settlement history and cannot be permanently deleted. Keep the account deactivated instead."
      : null,
  };
}

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

  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
    take: ADMIN_USERS_PAGE_SIZE,
    select: userListSelect,
  });
  const items = rows.map(mapAdminUser);

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
  const user = await prisma.user.findUnique({
    where: { id },
    select: userListSelect,
  });
  return user ? mapAdminUser(user) : null;
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
