import Link from "next/link";
import type { Metadata } from "next";
import type { Role } from "@prisma/client";

import { AdminHeader } from "@/components/admin/AdminHeader";
import { Avatar } from "@/components/ui/Avatar";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { DeleteUserButton } from "@/components/admin/DeleteUserButton";
import { requireAdmin, listUsers, userCounts } from "@/lib/admin";
import { ROLE_VALUES, ROLE_LABELS, SKILL_LEVELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Admin — Manage Users — Sports 360",
};

const skillLabel = (value: string) =>
  SKILL_LEVELS.find((s) => s.value === value)?.label ?? value;

function isRole(value: string | undefined): value is Role {
  return !!value && (ROLE_VALUES as readonly string[]).includes(value);
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const roleFilter = isRole(sp.role) ? sp.role : undefined;

  const [counts, users] = await Promise.all([
    userCounts(),
    listUsers({ query: q || undefined, role: roleFilter }),
  ]);
  const total = counts.ADMIN + counts.PLAYER + counts.PARTNER;

  const cards: { label: string; count: number; href: string; active: boolean }[] =
    [
      { label: "All", count: total, href: "/admin", active: !roleFilter },
      {
        label: "Players",
        count: counts.PLAYER,
        href: "/admin?role=PLAYER",
        active: roleFilter === "PLAYER",
      },
      {
        label: "Partners",
        count: counts.PARTNER,
        href: "/admin?role=PARTNER",
        active: roleFilter === "PARTNER",
      },
      {
        label: "Admins",
        count: counts.ADMIN,
        href: "/admin?role=ADMIN",
        active: roleFilter === "ADMIN",
      },
    ];

  return (
    <main className="min-h-screen bg-white px-4 py-8 sm:py-10">
      <div className="mx-auto w-full max-w-5xl">
        <AdminHeader email={admin?.email} />

        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manage Users</h1>
            <p className="mt-1 text-sm text-gray-500">
              Players and partners across Sports 360.
            </p>
          </div>
          <Link
            href="/admin/new"
            className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            + New user
          </Link>
        </div>

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

        {/* Search */}
        <form method="get" className="mt-6 flex gap-2">
          {roleFilter && <input type="hidden" name="role" value={roleFilter} />}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name, player name, or email"
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            className="shrink-0 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Search
          </button>
          {(q || roleFilter) && (
            <Link
              href="/admin"
              className="flex shrink-0 items-center rounded-lg px-3 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Clear
            </Link>
          )}
        </form>

        {/* Table */}
        <div className="mt-4 overflow-x-auto rounded-2xl border border-gray-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Skill</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-gray-400"
                  >
                    No users found.
                  </td>
                </tr>
              )}
              {users.map((u) => {
                const isSelf = u.id === admin?.id;
                return (
                  <tr key={u.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar src={u.image} name={u.name ?? u.email} size={36} />
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900">
                            {u.name ?? "—"}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-normal text-gray-400">
                                (you)
                              </span>
                            )}
                          </div>
                          {u.playerName && (
                            <div className="text-xs text-gray-400">
                              {u.playerName}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.role === "PARTNER" ? "—" : skillLabel(u.skillLevel)}
                    </td>
                    <td className="px-4 py-3">
                      <RoleSelect
                        userId={u.id}
                        role={u.role}
                        disabled={isSelf}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {fmtDate(u.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/${u.id}/edit`}
                          className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary-soft"
                        >
                          Edit
                        </Link>
                        {!isSelf && (
                          <DeleteUserButton
                            userId={u.id}
                            name={u.name ?? u.email}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-gray-400">
          {users.length} {users.length === 1 ? "user" : "users"} shown
          {roleFilter ? ` · filtered by ${ROLE_LABELS[roleFilter]}` : ""}
        </p>
      </div>
    </main>
  );
}
