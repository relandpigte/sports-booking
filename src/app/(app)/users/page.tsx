import Link from "next/link";
import type { Metadata } from "next";
import type { PartnerStatus, Role, TrainerStatus } from "@prisma/client";

import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import {
  listUsers,
  requireAdmin,
  trainerUserCount,
  userCounts,
} from "@/lib/admin";
import { ROLE_LABELS, ROLE_VALUES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Manage Users — Bunal.club",
};

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

type ProfileFilter = keyof typeof profileFilters;

const profileFilterOptions: { value: ProfileFilter; label: string }[] = [
  { value: "TRAINER_ACTIVE", label: "Trainer · Active" },
  { value: "TRAINER_PENDING", label: "Trainer · Pending review" },
  { value: "TRAINER_DRAFT", label: "Trainer · Draft" },
  { value: "TRAINER_DEACTIVATED", label: "Trainer · Deactivated" },
  { value: "PARTNER_ACTIVE", label: "Partner · Verified" },
  { value: "PARTNER_PENDING", label: "Partner · Pending review" },
  { value: "PARTNER_DRAFT", label: "Partner · Draft" },
  { value: "PARTNER_DEACTIVATED", label: "Partner · Deactivated" },
];

function isRole(value: string | undefined): value is Role {
  return !!value && (ROLE_VALUES as readonly string[]).includes(value);
}

function isProfileFilter(value: string): value is ProfileFilter {
  return value in profileFilters;
}

function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function usersHref({
  query,
  role,
  trainerOnly,
  profileStatus,
  page,
}: {
  query?: string;
  role?: Role;
  trainerOnly?: boolean;
  profileStatus?: ProfileFilter;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (role) params.set("role", role);
  if (trainerOnly) params.set("trainer", "1");
  if (profileStatus) params.set("profileStatus", profileStatus);
  if (page && page > 1) params.set("page", String(page));
  const value = params.toString();
  return `/users${value ? `?${value}` : ""}`;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = firstSearchValue(sp.q).trim().slice(0, 100);
  const requestedRole = firstSearchValue(sp.role);
  const roleFilter = isRole(requestedRole) ? requestedRole : undefined;
  const trainerOnly = firstSearchValue(sp.trainer) === "1";
  const requestedProfileStatus = firstSearchValue(sp.profileStatus);
  const profileStatus = isProfileFilter(requestedProfileStatus)
    ? requestedProfileStatus
    : undefined;
  const statusFilter = profileStatus ? profileFilters[profileStatus] : undefined;
  const trainerStatusFilter =
    statusFilter && "trainerStatus" in statusFilter
      ? statusFilter.trainerStatus
      : undefined;
  const partnerStatusFilter =
    statusFilter && "partnerStatus" in statusFilter
      ? statusFilter.partnerStatus
      : undefined;
  const requestedPage = Number.parseInt(firstSearchValue(sp.page), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [counts, trainers, users] = await Promise.all([
    userCounts(),
    trainerUserCount(),
    listUsers({
      query: q || undefined,
      role: roleFilter,
      trainerOnly,
      trainerStatus: trainerStatusFilter,
      partnerStatus: partnerStatusFilter,
      page,
    }),
  ]);
  const total = counts.ADMIN + counts.PLAYER + counts.PARTNER;

  const cards: {
    label: string;
    description: string;
    count: number;
    href: string;
    active: boolean;
    icon: SummaryIconName;
    subset?: boolean;
  }[] = [
    {
      label: "All users",
      description: "Every account",
      count: total,
      href: "/users",
      active: !roleFilter && !trainerOnly && !profileStatus,
      icon: "users",
    },
    {
      label: "Players",
      description: "Primary player role",
      count: counts.PLAYER,
      href: "/users?role=PLAYER",
      active: roleFilter === "PLAYER" && !trainerOnly && !profileStatus,
      icon: "player",
    },
    {
      label: "Trainers",
      description: "Capability on player accounts",
      count: trainers,
      href: "/users?trainer=1",
      active: trainerOnly && !profileStatus,
      icon: "trainer",
      subset: true,
    },
    {
      label: "Partners",
      description: "Venue accounts",
      count: counts.PARTNER,
      href: "/users?role=PARTNER",
      active: roleFilter === "PARTNER" && !profileStatus,
      icon: "partner",
    },
    {
      label: "Admins",
      description: "Owner access",
      count: counts.ADMIN,
      href: "/users?role=ADMIN",
      active: roleFilter === "ADMIN" && !profileStatus,
      icon: "admin",
    },
  ];

  const hasFilters = Boolean(q || roleFilter || trainerOnly || profileStatus);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Owner workspace"
        title="Manage Users"
        description="Review accounts, role access, trainer capabilities, partner status, and recent activity across Bunal.club."
        actions={
          <Link
            href="/users/new"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            <UserPlusIcon />
            New user
          </Link>
        }
      />

      <section className="mt-6" aria-labelledby="directory-summary-heading">
        <h2 id="directory-summary-heading" className="sr-only">
          Directory summary filters
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {cards.map((card) => (
            <Link
              key={card.label}
              href={card.href}
              aria-current={card.active ? "page" : undefined}
              className={`relative min-h-32 rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm ${
                card.active
                  ? card.subset
                    ? "border-ocean/40 bg-ocean-soft shadow-sm shadow-ocean/5"
                    : "border-primary bg-primary-soft shadow-sm shadow-primary/5"
                  : "border-[#dfe7e2] bg-white hover:border-primary/30"
              } ${card.label === "Admins" ? "col-span-2 lg:col-span-1" : ""}`}
            >
              {card.subset && (
                <span className="absolute right-3 top-3 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ocean">
                  Subset
                </span>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="text-2xl font-black tabular-nums text-navy">
                  {card.count.toLocaleString("en-PH")}
                </p>
                {!card.subset && (
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                      card.active
                        ? "bg-white text-primary"
                        : "bg-navy-soft text-navy"
                    }`}
                  >
                    <SummaryIcon name={card.icon} />
                  </span>
                )}
              </div>
              <p
                className={`mt-2 text-sm font-bold ${
                  card.active && !card.subset ? "text-primary" : "text-navy"
                }`}
              >
                {card.label}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {card.description}
              </p>
            </Link>
          ))}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-ocean/15 bg-ocean-soft/60 px-4 py-3 text-xs leading-5 text-slate-600">
          <InfoIcon />
          <p>
            Trainers are player accounts with an additional trainer profile.
            They are already included in Players and All users.
          </p>
        </div>
      </section>

      <AdminUsersTable
        users={users.items}
        adminId={admin.id}
        toolbar={
          <form
            method="get"
            className="grid min-w-0 flex-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_160px_210px_auto]"
          >
            {trainerOnly && (
              <input type="hidden" name="trainer" value="1" />
            )}
            <label className="relative block">
              <span className="sr-only">Search users</span>
              <SearchIcon />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Name, player name, or email"
                className="min-h-11 w-full rounded-xl border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </label>
            <label>
              <span className="sr-only">Account role</span>
              <select
                name="role"
                defaultValue={roleFilter ?? ""}
                className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">All roles</option>
                {ROLE_VALUES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Profile status</span>
              <select
                name="profileStatus"
                defaultValue={profileStatus ?? ""}
                className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">All profile statuses</option>
                {profileFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-navy px-5 text-sm font-semibold text-white transition-colors hover:bg-navy-hover"
            >
              Search
            </button>
            {hasFilters && (
              <Link
                href="/users"
                className="inline-flex min-h-10 items-center justify-center text-sm font-semibold text-slate-500 hover:text-navy lg:col-start-4"
              >
                Clear filters
              </Link>
            )}
          </form>
        }
      />

      <div className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="text-xs text-gray-400">
          {users.total > 0
            ? `Showing ${(users.page - 1) * users.pageSize + 1}–${Math.min(
                users.page * users.pageSize,
                users.total
              )} of ${users.total} users`
            : "No users shown"}
          {trainerOnly ? " · Trainers" : ""}
          {roleFilter ? ` · ${ROLE_LABELS[roleFilter]}` : ""}
        </p>
        <nav className="flex gap-2" aria-label="User pages">
          <PaginationLink
            href={
              users.page > 1
                ? usersHref({
                    query: q,
                    role: roleFilter,
                    trainerOnly,
                    profileStatus,
                    page: users.page - 1,
                  })
                : null
            }
          >
            Previous
          </PaginationLink>
          <span className="inline-flex h-9 items-center px-2 text-xs font-semibold text-gray-500">
            Page {users.page} of {users.pageCount}
          </span>
          <PaginationLink
            href={
              users.page < users.pageCount
                ? usersHref({
                    query: q,
                    role: roleFilter,
                    trainerOnly,
                    profileStatus,
                    page: users.page + 1,
                  })
                : null
            }
          >
            Next
          </PaginationLink>
        </nav>
      </div>
    </div>
  );
}

function PaginationLink({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  const className =
    "inline-flex h-9 items-center rounded-lg border px-3 text-xs font-semibold";
  if (!href) {
    return (
      <span
        aria-disabled="true"
        className={`${className} border-gray-200 text-gray-300`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={`${className} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
    >
      {children}
    </Link>
  );
}

type SummaryIconName = "users" | "player" | "trainer" | "partner" | "admin";

function SummaryIcon({ name }: { name: SummaryIconName }) {
  const paths: Record<SummaryIconName, React.ReactNode> = {
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    player: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0" />
      </>
    ),
    trainer: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M5 21a7 7 0 0 1 14 0M17 14l2 2 3-4" />
      </>
    ),
    partner: (
      <>
        <path d="M3 21h18M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
    admin: (
      <>
        <path d="M12 3 4 7v5c0 5 3.4 8.5 8 9 4.6-.5 8-4 8-9V7l-8-4Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
  };
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-ocean"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
