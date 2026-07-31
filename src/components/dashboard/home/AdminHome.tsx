import Link from "next/link";
import type { Role } from "@prisma/client";

export function AdminHome({
  name,
  counts,
  pendingPartners,
  pendingSettlements,
}: {
  name: string | null;
  counts: Record<Role, number>;
  pendingPartners: number;
  pendingSettlements: number;
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

      {pendingPartners > 0 && (
        <Link
          href="/users?role=PARTNER"
          className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
        >
          <div>
            <p className="font-semibold">
              {pendingPartners} partner{" "}
              {pendingPartners === 1 ? "application" : "applications"} to review
            </p>
            <p className="mt-0.5 text-sm text-amber-800">
              Verify the venue details before activating access.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold">Review →</span>
        </Link>
      )}

      {pendingSettlements > 0 && (
        <Link
          href="/dashboard/admin/settlements"
          className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"
        >
          <div>
            <p className="font-semibold">
              {pendingSettlements} service-fee{" "}
              {pendingSettlements === 1 ? "settlement" : "settlements"} to
              review
            </p>
            <p className="mt-0.5 text-sm text-amber-800">
              Verify the payment reference and receipt before marking it paid.
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold">Review →</span>
        </Link>
      )}

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
            href="/dashboard/admin/payments"
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            Payment collection
          </Link>
        </div>
      </section>
    </div>
  );
}
