import Link from "next/link";
import { SKILL_LEVELS } from "@/lib/constants";

type PlayerHomeUser = {
  name: string | null;
  playerName: string | null;
  skillLevel: string;
  privateProfile: boolean;
};

export function PlayerHome({ user }: { user: PlayerHomeUser }) {
  const skillLabel =
    SKILL_LEVELS.find((s) => s.value === user.skillLevel)?.label ??
    user.skillLevel ??
    "—";

  const stats = [
    { label: "Upcoming bookings", value: "0", href: "/dashboard/bookings" },
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
          Play. Book. Connect. All in one app.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-2xl border border-gray-200 p-4 transition-colors hover:border-gray-300"
          >
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="mt-0.5 text-sm text-gray-500">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
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
          <p className="mt-3 text-sm text-gray-500">
            You have no upcoming bookings. Find a court to get started.
          </p>
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
