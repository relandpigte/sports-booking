import Link from "next/link";

import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/DashboardIcon";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { SKILL_LEVELS } from "@/lib/constants";
import type { BookingView } from "@/lib/bookings";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { formatPHP } from "@/lib/currency";

type PlayerHomeUser = {
  name: string | null;
  playerName: string | null;
  skillLevel: string;
  privateProfile: boolean;
};

export function PlayerHome({
  user,
  upcomingCount,
  nextBooking,
}: {
  user: PlayerHomeUser;
  upcomingCount: number;
  nextBooking: BookingView | null;
}) {
  const skillLabel =
    SKILL_LEVELS.find((s) => s.value === user.skillLevel)?.label ??
    user.skillLevel ??
    "—";

  const stats = [
    {
      label: "Upcoming bookings",
      value: String(upcomingCount),
      href: "/dashboard/bookings",
      icon: "booking" as DashboardIconName,
      tone: "bg-primary-soft text-primary",
    },
    {
      label: "Tournaments joined",
      value: "0",
      href: "/dashboard/tournaments",
      icon: "trophy" as DashboardIconName,
      tone: "bg-accent-soft text-navy",
    },
    {
      label: "Skill level",
      value: skillLabel,
      href: "/dashboard/account",
      icon: "profile" as DashboardIconName,
      tone: "bg-ocean-soft text-ocean",
    },
    {
      label: "Profile",
      value: user.privateProfile ? "Private" : "Public",
      href: "/dashboard/account",
      icon: "account" as DashboardIconName,
      tone: "bg-navy-soft text-navy",
    },
  ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Player dashboard"
        title={`Welcome back, ${user.playerName ?? user.name ?? "Player"}`}
        description="Your next game, upcoming bookings, and player profile in one place."
        badge={
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-sm shadow-navy/5">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Player
          </span>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-2xl border border-[#dfe7e2] bg-white p-4 shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-navy/5"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">{s.label}</p>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.tone}`}
              >
                <DashboardIcon name={s.icon} className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-3 text-xl font-black text-navy sm:text-2xl">
              {s.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <DashboardIcon name="booking" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">
                  Your schedule
                </p>
                <h2 className="font-bold text-navy">Next booking</h2>
              </div>
            </div>
            <Link
              href="/dashboard/bookings"
              className="text-sm font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {nextBooking ? (
            <div className="mt-3">
              <Link
                href={`/hubs/${nextBooking.hub.id}`}
                className="text-lg font-bold text-navy hover:text-primary"
              >
                {nextBooking.hub.name}
              </Link>
              <p className="text-sm text-slate-500">{nextBooking.court.name}</p>
              <p className="mt-4 text-sm font-semibold text-navy">
                {formatManilaDateLong(nextBooking.date)}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {formatSlotRange(nextBooking.startHour, nextBooking.endHour)}
                {nextBooking.totalPrice != null
                  ? ` · ${formatPHP(nextBooking.totalPrice)}`
                  : ""}
              </p>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5">
              <p className="text-sm text-slate-500">
                You have no upcoming bookings yet.
              </p>
              <Link
                href="/hubs"
                className="mt-3 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
              >
                Find a court
              </Link>
            </div>
          )}
        </section>

        <div className="grid gap-4">
          <Link
            href="/hubs"
            className="group relative overflow-hidden rounded-2xl bg-navy p-5 shadow-lg shadow-navy/10 transition-transform hover:-translate-y-0.5 sm:p-6"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/25 blur-3xl"
            />
            <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-accent">
              <DashboardIcon name="map" />
            </span>
            <h2 className="relative mt-5 text-lg font-bold text-white">
              Find your next court
            </h2>
            <p className="relative mt-1 text-sm leading-6 text-white/60">
              Browse volleyball, badminton, pickleball, and tennis venues
              across Bohol.
            </p>
            <p className="relative mt-5 text-sm font-bold text-accent">
              Browse hubs →
            </p>
          </Link>

          <section className="rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-navy">Tournaments</h2>
              <Link
                href="/dashboard/tournaments"
                className="text-sm font-semibold text-primary hover:underline"
              >
                Browse
              </Link>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              No tournaments joined yet. Browse what&apos;s on near you.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
