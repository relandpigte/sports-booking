import Link from "next/link";
import type { Role } from "@prisma/client";

export function AdminHome({
  name,
  counts,
}: {
  name: string | null;
  counts: Record<Role, number>;
}) {
  const total = counts.ADMIN + counts.PLAYER + counts.PARTNER;

  const cards = [
    { label: "Total users", value: total, href: "/users" },
    { label: "Players", value: counts.PLAYER, href: "/users?role=PLAYER" },
    { label: "Partners", value: counts.PARTNER, href: "/users?role=PARTNER" },
    { label: "Admins", value: counts.ADMIN, href: "/users?role=ADMIN" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {name ?? "Admin"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Platform overview and user management.
          </p>
        </div>
        <span className="mt-1 shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
          Admin
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-gray-200 p-4 transition-colors hover:border-gray-300"
          >
            <p className="text-2xl font-bold text-gray-900">{c.value}</p>
            <p className="mt-0.5 text-sm text-gray-500">{c.label}</p>
          </Link>
        ))}
      </div>

      <section className="mt-6 rounded-2xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900">Manage</h2>
        <p className="mt-1 text-sm text-gray-500">
          View, search, create, and edit players and partners.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/users"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Manage users
          </Link>
          <Link
            href="/users/new"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            + New user
          </Link>
          <Link
            href="/dashboard/admin/subscriptions"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Subscriptions
          </Link>
        </div>
      </section>
    </div>
  );
}
