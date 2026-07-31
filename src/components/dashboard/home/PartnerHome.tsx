import Link from "next/link";

import type { PartnerStatus } from "@prisma/client";

type PartnerHomeUser = {
  name: string | null;
  playerName: string | null;
};

export function PartnerHome({
  user,
  partnerStatus,
  isGatewayConnected,
}: {
  user: PartnerHomeUser;
  partnerStatus: PartnerStatus | null;
  isGatewayConnected: boolean;
}) {
  const active = partnerStatus === "ACTIVE";
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

      {!active && (
        <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">
            Your partner account is under review
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            An admin will verify your business details before activating your
            account. You can update your account information while you wait.
          </p>
        </section>
      )}

      {active && (
        <section className="mt-6 rounded-2xl border border-gray-200 p-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Set up your venue
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Connect the account that receives player payments, then add your
              first hub.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Link
              href="/dashboard/payments?setup=hub"
              className={`rounded-xl border p-4 transition-colors ${
                isGatewayConnected
                  ? "border-green-200 bg-green-50 hover:border-green-300"
                  : "border-primary/30 bg-primary-soft hover:border-primary/50"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                  Step 1
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isGatewayConnected
                      ? "bg-green-100 text-green-700"
                      : "bg-white text-primary"
                  }`}
                >
                  {isGatewayConnected ? "Connected" : "Required"}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">
                Connect PayMongo
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                Booking proceeds land in your own payment account.
              </p>
            </Link>

            {isGatewayConnected ? (
              <Link
                href="/dashboard/hubs"
                className="rounded-xl border border-gray-200 p-4 transition-colors hover:border-gray-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">
                    Step 2
                  </span>
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Ready
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-gray-900">
                  Add and manage hubs
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Publish your venue, courts, rates, and operating hours.
                </p>
              </Link>
            ) : (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-gray-400">
                    Step 2
                  </span>
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-500">
                    Locked
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-gray-500">
                  Add your hub
                </h3>
                <p className="mt-1 text-sm text-gray-400">
                  Available after PayMongo is connected.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {active && isGatewayConnected && (
          <Link
            href="/dashboard/payments"
            className="rounded-2xl border border-gray-200 p-5 transition-colors hover:border-gray-300"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-gray-900">
                Payments
              </h2>
              <span className="text-sm font-medium text-primary">Manage →</span>
            </div>
            <p className="mt-1.5 text-sm text-gray-500">
              Manage PayMongo and settle Bunal.club service fees.
            </p>
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
