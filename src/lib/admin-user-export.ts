import "server-only";

import type { PartnerStatus, TrainerStatus } from "@prisma/client";

import { userDirectoryWhere } from "@/lib/admin";
import {
  userDirectoryParams,
  type UserDirectoryFilters,
} from "@/lib/admin-user-filters";
import { ROLE_LABELS, SKILL_LEVELS } from "@/lib/constants";
import { csvDocument, csvRow } from "@/lib/csv";
import { getAuthenticatedUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { formatManilaTimestamp, manilaToday } from "@/lib/time";

// Rows are read in pages so a large directory never loads in one query.
const EXPORT_BATCH_SIZE = 1000;

const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending review",
  ACTIVE: "Verified",
  DEACTIVATED: "Deactivated",
};

const TRAINER_STATUS_LABELS: Record<TrainerStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Pending review",
  ACTIVE: "Active",
  DEACTIVATED: "Deactivated",
};

// Never add secrets here (password hash, MFA secret, session data).
const exportSelect = {
  id: true,
  name: true,
  playerName: true,
  username: true,
  email: true,
  emailVerified: true,
  phone: true,
  facebookPage: true,
  role: true,
  partnerStatus: true,
  skillLevel: true,
  privateProfile: true,
  mfaEnabledAt: true,
  lastLoginAt: true,
  loginCount: true,
  createdAt: true,
  trainerProfile: { select: { status: true } },
} as const;

const HEADER = [
  "User ID",
  "Name",
  "Player name",
  "Username",
  "Email",
  "Email verified",
  "Phone",
  "Role",
  "Trainer status",
  "Partner status",
  "Skill level",
  "Profile",
  "MFA",
  "Facebook page",
  "Joined (Manila)",
  "Last sign-in (Manila)",
  "Sign-ins",
];

export type UserExport = { csv: string; filename: string; count: number };

// Builds the CSV for every user matching the Manage Users filters. Returns null
// unless the real signed-in account is an admin. Each export is recorded as a
// security event on the admin's account, since the file holds personal data.
export async function exportUsersCsv(
  filters: UserDirectoryFilters
): Promise<UserExport | null> {
  const admin = await getAuthenticatedUser();
  if (!admin || admin.role !== "ADMIN") return null;

  const where = userDirectoryWhere(filters);
  const lines = [csvRow(HEADER)];
  let cursor: string | undefined;
  let count = 0;

  for (;;) {
    const batch = await prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: EXPORT_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: exportSelect,
    });
    for (const user of batch) {
      lines.push(
        csvRow([
          user.id,
          user.name,
          user.playerName,
          user.username,
          user.email,
          user.emailVerified ? "Yes" : "No",
          user.phone,
          ROLE_LABELS[user.role],
          user.trainerProfile
            ? TRAINER_STATUS_LABELS[user.trainerProfile.status]
            : "",
          user.partnerStatus ? PARTNER_STATUS_LABELS[user.partnerStatus] : "",
          SKILL_LEVELS.find((level) => level.value === user.skillLevel)
            ?.label ?? user.skillLevel,
          user.privateProfile ? "Private" : "Public",
          user.mfaEnabledAt ? "On" : "Off",
          user.facebookPage,
          formatManilaTimestamp(user.createdAt),
          user.lastLoginAt ? formatManilaTimestamp(user.lastLoginAt) : "",
          user.loginCount,
        ])
      );
    }
    count += batch.length;
    if (batch.length < EXPORT_BATCH_SIZE) break;
    cursor = batch[batch.length - 1].id;
  }

  await prisma.securityEvent.create({
    data: {
      userId: admin.id,
      type: "USERS_EXPORTED",
      metadata: {
        rows: count,
        filters: Object.fromEntries(userDirectoryParams(filters)),
      },
    },
  });

  const scope = filters.role
    ? `-${filters.role.toLowerCase()}s`
    : filters.trainerOnly
      ? "-trainers"
      : "";
  return {
    csv: csvDocument(lines),
    filename: `bunal-users${scope}-${manilaToday()}.csv`,
    count,
  };
}
