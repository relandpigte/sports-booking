import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

import { AdminUsersTable } from "@/components/admin/AdminUsersTable";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { requireAdmin, listUsers, userCounts } from "@/lib/admin";
import { ROLE_VALUES, ROLE_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Manage Users — Bunal.club",
};

function isRole(value: string | undefined): value is Role {
  return !!value && (ROLE_VALUES as readonly string[]).includes(value);
}

function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function usersHref({
  query,
  role,
  page,
}: {
  query?: string;
  role?: Role;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (role) params.set("role", role);
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
  const requestedPage = Number.parseInt(firstSearchValue(sp.page), 10);
  const page =
    Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [counts, users] = await Promise.all([
    userCounts(),
    listUsers({ query: q || undefined, role: roleFilter, page }),
  ]);
  const total = counts.ADMIN + counts.PLAYER + counts.PARTNER;

  const cards: { label: string; count: number; href: string; active: boolean }[] =
    [
      { label: "All", count: total, href: "/users", active: !roleFilter },
      {
        label: "Players",
        count: counts.PLAYER,
        href: "/users?role=PLAYER",
        active: roleFilter === "PLAYER",
      },
      {
        label: "Partners",
        count: counts.PARTNER,
        href: "/users?role=PARTNER",
        active: roleFilter === "PARTNER",
      },
      {
        label: "Admins",
        count: counts.ADMIN,
        href: "/users?role=ADMIN",
        active: roleFilter === "ADMIN",
      },
    ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Owner workspace"
        title="Manage Users"
        description="Players, partners, and administrators across Bunal.club."
        actions={
          <Link
            href="/users/new"
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            + New user
          </Link>
        }
      />

      {/* Stat / filter cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={`rounded-xl border p-4 transition-colors ${
              c.active
                ? "border-primary bg-primary-soft"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{c.count}</p>
            <p
              className={`mt-0.5 text-sm font-medium ${
                c.active ? "text-primary" : "text-gray-500"
              }`}
            >
              {c.label}
            </p>
          </Link>
        ))}
      </div>

      <AdminUsersTable
        users={users.items}
        adminId={admin.id}
        toolbar={
          <form method="get" className="flex max-w-xl gap-2">
            {roleFilter && (
              <input type="hidden" name="role" value={roleFilter} />
            )}
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search by name, player name, or email"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Search
            </button>
            {(q || roleFilter) && (
              <Link
                href="/users"
                className="hidden shrink-0 items-center rounded-lg px-2 text-sm font-medium text-gray-500 hover:text-gray-700 sm:flex"
              >
                Clear
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
          {roleFilter ? ` · ${ROLE_LABELS[roleFilter]}` : ""}
        </p>
        <nav className="flex gap-2" aria-label="User pages">
          <PaginationLink
            href={
              users.page > 1
                ? usersHref({ query: q, role: roleFilter, page: users.page - 1 })
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
                ? usersHref({ query: q, role: roleFilter, page: users.page + 1 })
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
