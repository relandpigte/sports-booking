import Link from "next/link";
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
    },
    { label: "Tournaments joined", value: "0", href: "/dashboard/tournaments" },
    { label: "Skill level", value: skillLabel, href: "/dashboard/account" },
    {
      label: "Profile",
      value: user.privateProfile ? "Private" : "Public",
      href: "/dashboard/account",
    },
  ];

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user.playerName ?? user.name ?? "Player"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Play. Compete. Connect. Bohol’s courts, in one app.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-2xl border border-gray-200 p-4 transition-all hover:border-primary/30 hover:shadow-md hover:shadow-navy/5"
          >
            <p className="text-2xl font-bold text-navy">{s.value}</p>
            <p className="mt-0.5 text-sm text-gray-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <Link
        href="/hubs"
        className="relative mt-6 block overflow-hidden rounded-2xl bg-navy p-5 transition-transform hover:-translate-y-0.5 sm:p-6"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-primary/30 blur-3xl"
        />
        <div className="relative flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">Find a hub</h2>
          <span className="text-sm font-medium text-accent">Browse →</span>
        </div>
        <p className="relative mt-1 text-sm text-white/70">
          Volleyball, badminton and pickleball venues across Bohol.
        </p>
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Next up</h2>
            <Link
              href="/dashboard/bookings"
              className="text-sm font-medium text-primary hover:underline"
            >
              View all
            </Link>
          </div>
          {nextBooking ? (
            <div className="mt-3">
              <Link
                href={`/hubs/${nextBooking.hub.id}`}
                className="font-medium text-gray-900 hover:underline"
              >
                {nextBooking.hub.name}
              </Link>
              <p className="text-sm text-gray-500">{nextBooking.court.name}</p>
              <p className="mt-2 text-sm font-medium text-gray-900">
                {formatManilaDateLong(nextBooking.date)}
              </p>
              <p className="text-sm text-gray-500">
                {formatSlotRange(nextBooking.startHour, nextBooking.endHour)}
                {nextBooking.totalPrice != null
                  ? ` · ${formatPHP(nextBooking.totalPrice)}`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              You have no upcoming bookings. Find a court to get started.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              Tournaments
            </h2>
            <Link
              href="/dashboard/tournaments"
              className="text-sm font-medium text-primary hover:underline"
            >
              Browse
            </Link>
          </div>
          <p className="mt-3 text-sm text-gray-500">
            No tournaments joined yet. Browse what&apos;s on near you.
          </p>
        </section>
      </div>
    </div>
  );
}
