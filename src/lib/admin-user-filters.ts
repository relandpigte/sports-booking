import type { PartnerStatus, Role, TrainerStatus } from "@prisma/client";

import { ROLE_VALUES } from "@/lib/constants";

// The Manage Users filters, read from the URL. Shared by the page and the CSV
// export so an export always contains exactly what the filters select.

const profileFilters = {
  TRAINER_ACTIVE: { trainerStatus: "ACTIVE" as TrainerStatus },
  TRAINER_PENDING: { trainerStatus: "PENDING" as TrainerStatus },
  TRAINER_DRAFT: { trainerStatus: "DRAFT" as TrainerStatus },
  TRAINER_DEACTIVATED: { trainerStatus: "DEACTIVATED" as TrainerStatus },
  PARTNER_ACTIVE: { partnerStatus: "ACTIVE" as PartnerStatus },
  PARTNER_PENDING: { partnerStatus: "PENDING" as PartnerStatus },
  PARTNER_DRAFT: { partnerStatus: "DRAFT" as PartnerStatus },
  PARTNER_DEACTIVATED: { partnerStatus: "DEACTIVATED" as PartnerStatus },
};

export type ProfileFilter = keyof typeof profileFilters;

export const profileFilterOptions: { value: ProfileFilter; label: string }[] = [
  { value: "TRAINER_ACTIVE", label: "Trainer · Active" },
  { value: "TRAINER_PENDING", label: "Trainer · Pending review" },
  { value: "TRAINER_DRAFT", label: "Trainer · Draft" },
  { value: "TRAINER_DEACTIVATED", label: "Trainer · Deactivated" },
  { value: "PARTNER_ACTIVE", label: "Partner · Verified" },
  { value: "PARTNER_PENDING", label: "Partner · Pending review" },
  { value: "PARTNER_DRAFT", label: "Partner · Draft" },
  { value: "PARTNER_DEACTIVATED", label: "Partner · Deactivated" },
];

export type UserDirectoryFilters = {
  query?: string;
  role?: Role;
  trainerOnly: boolean;
  profileStatus?: ProfileFilter;
  trainerStatus?: TrainerStatus;
  partnerStatus?: PartnerStatus;
};

function isRole(value: string): value is Role {
  return (ROLE_VALUES as readonly string[]).includes(value);
}

function isProfileFilter(value: string): value is ProfileFilter {
  return Object.hasOwn(profileFilters, value);
}

// `get` returns the first value for a search param (or undefined), so this
// works for both Next.js searchParams objects and URLSearchParams.
export function parseUserDirectoryFilters(
  get: (name: string) => string | undefined
): UserDirectoryFilters {
  const query = (get("q") ?? "").trim().slice(0, 100);
  const role = get("role") ?? "";
  const profile = get("profileStatus") ?? "";
  const profileStatus = isProfileFilter(profile) ? profile : undefined;
  const status = profileStatus ? profileFilters[profileStatus] : undefined;
  return {
    query: query || undefined,
    role: isRole(role) ? role : undefined,
    trainerOnly: get("trainer") === "1",
    profileStatus,
    trainerStatus:
      status && "trainerStatus" in status ? status.trainerStatus : undefined,
    partnerStatus:
      status && "partnerStatus" in status ? status.partnerStatus : undefined,
  };
}

export function userDirectoryParams(
  filters: Pick<
    UserDirectoryFilters,
    "query" | "role" | "trainerOnly" | "profileStatus"
  >
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.role) params.set("role", filters.role);
  if (filters.trainerOnly) params.set("trainer", "1");
  if (filters.profileStatus) params.set("profileStatus", filters.profileStatus);
  return params;
}

export function usersHref(
  filters: UserDirectoryFilters,
  page?: number
): string {
  const params = userDirectoryParams(filters);
  if (page && page > 1) params.set("page", String(page));
  const value = params.toString();
  return `/users${value ? `?${value}` : ""}`;
}

export function usersExportHref(filters: UserDirectoryFilters): string {
  const value = userDirectoryParams(filters).toString();
  return `/api/admin/users/export${value ? `?${value}` : ""}`;
}
