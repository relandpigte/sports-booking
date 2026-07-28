import Link from "next/link";

import { Badge, type BadgeTone } from "@/components/ui/Badge";

type PartnerHomeUser = {
  name: string | null;
  playerName: string | null;
};

export type PartnerHomeBilling = {
  planName: string;
  statusLabel: string;
  tone: BadgeTone;
  detail: string;
  usage: string;
};

export function PartnerHome({
  user,
  billing,
}: {
  user: PartnerHomeUser;
  billing: PartnerHomeBilling | null;
}) {
  const comingSoon = [
    {
      label: "Booking requests",
      desc: "Review and respond to players booking your courts.",
    },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user.name ?? user.playerName ?? "Partner"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Your partner workspace.
          </p>
        </div>
        <span className="mt-1 shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
          Partner
        </span>
      </div>

      <Link
        href="/dashboard/hubs"
        className="mt-6 block rounded-2xl border border-gray-200 p-5 transition-colors hover:border-gray-300"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-gray-900">My Hubs</h2>
          <span className="text-sm font-medium text-primary">Manage →</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Create and manage your venues — cover photos, logo, about, contact,
          and operating hours.
        </p>
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {billing && (
          <Link
            href="/dashboard/billing"
            className="rounded-2xl border border-gray-200 p-5 transition-colors hover:border-gray-300"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                {billing.planName}
              </h2>
              <Badge tone={billing.tone}>{billing.statusLabel}</Badge>
            </div>
            <p className="mt-1.5 text-sm text-gray-500">{billing.detail}</p>
            <p className="mt-1 text-sm text-gray-400">{billing.usage}</p>
          </Link>
        )}
        {comingSoon.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-dashed border-gray-300 p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                {c.label}
              </h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                Soon
              </span>
            </div>
            <p className="mt-1.5 text-sm text-gray-500">{c.desc}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-2xl border border-gray-200 p-5">
        <h2 className="text-base font-semibold text-gray-900">
          Account Settings
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Update your business details, contact info, and profile picture.
        </p>
        <Link
          href="/dashboard/account"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          Go to settings
        </Link>
      </section>
    </div>
  );
}
