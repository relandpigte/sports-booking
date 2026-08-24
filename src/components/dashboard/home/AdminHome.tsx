import Link from "next/link";
import type { Role } from "@prisma/client";

import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/DashboardIcon";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { AnalyticsHomeSummary } from "@/components/dashboard/home/AnalyticsHomeSummary";
import type { AnalyticsKpis } from "@/lib/business-analytics";

export function AdminHome({
  name,
  counts,
  pendingPartners,
  pendingSettlements,
  analytics,
}: {
  name: string | null;
  counts: Record<Role, number>;
  pendingPartners: number;
  pendingSettlements: number;
  analytics: AnalyticsKpis;
}) {
  const total = counts.ADMIN + counts.PLAYER + counts.PARTNER;

  const cards: {
    label: string;
    value: number;
    href: string;
    icon: DashboardIconName;
    tone: string;
  }[] = [
    {
      label: "Total users",
      value: total,
      href: "/users",
      icon: "users",
      tone: "bg-navy-soft text-navy",
    },
    {
      label: "Players",
      value: counts.PLAYER,
      href: "/users?role=PLAYER",
      icon: "profile",
      tone: "bg-ocean-soft text-ocean",
    },
    {
      label: "Partners",
      value: counts.PARTNER,
      href: "/users?role=PARTNER",
      icon: "hub",
      tone: "bg-primary-soft text-primary",
    },
    {
      label: "Admins",
      value: counts.ADMIN,
      href: "/users?role=ADMIN",
      icon: "shield",
      tone: "bg-accent-soft text-navy",
    },
  ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Owner dashboard"
        title={`Welcome back, ${name ?? "Owner"}`}
        description="Private platform oversight for users, partner access, payment collection, and service-fee settlements."
        badge={
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-sm shadow-navy/5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Owner
          </span>
        }
      />

      <AnalyticsHomeSummary audience="owner" kpis={analytics} />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-navy/5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">{c.label}</p>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.tone}`}
              >
                <DashboardIcon name={c.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-black text-navy">{c.value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-navy">
              <DashboardIcon name="alert" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                Needs attention
              </p>
              <h2 className="font-bold text-navy">Review queue</h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <Link
              href="/users?role=PARTNER"
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#f7faf8] p-4 transition-colors hover:border-primary/30"
            >
              <div>
                <p className="font-semibold text-navy">
                  Partner applications
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Verify venue businesses before activating access.
                </p>
              </div>
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-white px-3 text-sm font-black text-navy shadow-sm">
                {pendingPartners}
              </span>
            </Link>

            <Link
              href="/dashboard/admin/settlements"
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-[#f7faf8] p-4 transition-colors hover:border-primary/30"
            >
              <div>
                <p className="font-semibold text-navy">
                  Service-fee settlements
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Check references and receipts before marking payments paid.
                </p>
              </div>
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-white px-3 text-sm font-black text-navy shadow-sm">
                {pendingSettlements}
              </span>
            </Link>
          </div>
        </section>

        <section className="rounded-2xl bg-navy p-5 shadow-lg shadow-navy/10 sm:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">
            Owner controls
          </p>
          <h2 className="mt-2 text-xl font-black text-white">
            Manage the platform
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/60">
            Keep user access, collections, reports, and partner settlements in
            one private workspace.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              { label: "Users", href: "/users", icon: "users" as const },
              {
                label: "Collections",
                href: "/dashboard/admin/payments",
                icon: "payment" as const,
              },
              {
                label: "Reports",
                href: "/dashboard/admin/reports",
                icon: "report" as const,
              },
              {
                label: "Settlements",
                href: "/dashboard/admin/settlements",
                icon: "booking" as const,
              },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                <DashboardIcon
                  name={item.icon}
                  className="mb-3 h-5 w-5 text-accent"
                />
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/users/new"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
        >
          Add user
        </Link>
        <Link
          href="/users"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-primary/30 hover:bg-primary-soft"
        >
          Manage all users
        </Link>
      </div>
    </div>
  );
}
