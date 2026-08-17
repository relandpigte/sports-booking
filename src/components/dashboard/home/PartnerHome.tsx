import Link from "next/link";

import type { PartnerStatus } from "@prisma/client";

import {
  DashboardIcon,
  type DashboardIconName,
} from "@/components/dashboard/DashboardIcon";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { InstallAppCard } from "@/components/pwa/InstallAppCard";

type PartnerHomeUser = {
  name: string | null;
  playerName: string | null;
};

export function PartnerHome({
  user,
  partnerStatus,
  isPaymentReady,
  hasHub,
  canOperate,
}: {
  user: PartnerHomeUser;
  partnerStatus: PartnerStatus | null;
  isPaymentReady: boolean;
  hasHub: boolean;
  canOperate?: boolean;
}) {
  const active = partnerStatus === "ACTIVE";
  const draft = partnerStatus === "DRAFT";
  const deactivated = partnerStatus === "DEACTIVATED";
  const operational = canOperate ?? active;
  const remainingBookingSteps = Number(!hasHub) + Number(!isPaymentReady);
  const shortcuts: {
    label: string;
    desc: string;
    href: string;
    action: string;
    icon: DashboardIconName;
    tone: string;
  }[] = [
    {
      label: "My hubs",
      desc: "Manage venue details, courts, rates, and operating hours.",
      href: "/dashboard/hubs",
      action: "Manage hubs",
      icon: "hub",
      tone: "bg-ocean-soft text-ocean",
    },
    {
      label: "Bookings",
      desc: "Review player reservations across all your active courts.",
      href: "/dashboard/bookings",
      action: "View bookings",
      icon: "booking",
      tone: "bg-primary-soft text-primary",
    },
    {
      label: "Reports",
      desc: "Understand collected court revenue and booking performance.",
      href: "/dashboard/reports",
      action: "Open reports",
      icon: "report",
      tone: "bg-accent-soft text-navy",
    },
    {
      label: "Payments",
      desc: "Choose automatic or manual player payments and manage settlements.",
      href: "/dashboard/payments",
      action: "Manage payments",
      icon: "payment",
      tone: "bg-navy-soft text-navy",
    },
  ];

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Partner dashboard"
        title={`Welcome back, ${user.name ?? user.playerName ?? "Partner"}`}
        description="Manage your payment setup, venues, bookings, and court revenue."
        badge={
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-navy shadow-sm shadow-navy/5">
            <span
              className={`h-2 w-2 rounded-full ${
                active
                  ? "bg-primary"
                  : deactivated
                    ? "bg-red-500"
                    : "bg-amber-500"
              }`}
            />
            {active
              ? "Active partner"
              : deactivated
                ? "Deactivated"
                : draft
                  ? "Draft"
                  : "Under review"}
          </span>
        }
      />

      <InstallAppCard />

      {draft && (
        <section className="mt-8 rounded-2xl border border-primary/20 bg-white p-6 shadow-sm shadow-navy/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Partner checklist
              </p>
              <h2 className="mt-1 font-bold text-navy">
                Submit your venue details
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                {hasHub
                  ? "Your existing hub is ready. Review the owner and venue details, then explicitly submit the application for admin approval. Payment setup is only required before accepting bookings."
                  : "Add your owner details and first hub when you are ready. Your application enters the review queue only after you submit it."}
              </p>
            </div>
            <Link
              href="/dashboard/partner/onboarding"
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover"
            >
              Complete application
            </Link>
          </div>
        </section>
      )}

      {!active && !draft && !deactivated && (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-white p-6 shadow-sm shadow-navy/5">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <DashboardIcon name="alert" />
            </span>
            <div>
              <h2 className="font-bold text-navy">
                Your partner account is under review
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                The owner will verify your business details before activating
                venue access. You can update your account information while
                you wait.
              </p>
            </div>
          </div>
        </section>
      )}

      {deactivated && (
        <section className="mt-8 rounded-2xl border border-red-200 bg-white p-6 shadow-sm shadow-navy/5">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <DashboardIcon name="alert" />
            </span>
            <div>
              <h2 className="font-bold text-navy">
                Your partner account is deactivated
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Your venues are hidden and new bookings are paused. Contact
                Bunal.club support if you believe this was a mistake or want
                to request reactivation.
              </p>
            </div>
          </div>
        </section>
      )}

      {operational && (
        <section className="mt-8 overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5">
          <div className="flex flex-col gap-4 border-b border-[#dfe7e2] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                Venue onboarding
              </p>
              <h2 className="mt-1 text-lg font-bold text-navy">
                Complete your booking setup
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Add your first hub now, then configure automatic or manual
                player payments to open bookings.
              </p>
            </div>
            <span className="w-fit rounded-full bg-navy-soft px-3 py-1.5 text-xs font-bold text-navy">
              {remainingBookingSteps === 0
                ? "Booking setup ready"
                : `${remainingBookingSteps} booking ${remainingBookingSteps === 1 ? "step" : "steps"}`}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 bg-[#f7faf8] p-5 sm:grid-cols-2 sm:p-6">
            <Link
              href="/dashboard/hubs"
              className="rounded-xl border border-primary/25 bg-white p-5 shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-lg bg-primary-soft px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  Step 01
                </span>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {hasHub ? "Ready" : "Required for booking"}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">
                Add and manage hubs
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Publish your venue as Coming soon with courts, rates, and hours.
              </p>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                {hasHub ? "Open hubs →" : "Add hub →"}
              </p>
            </Link>

            <Link
              href="/dashboard/payments?setup=hub"
              className={`rounded-xl border bg-white p-5 shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 ${
                isPaymentReady
                  ? "border-primary/25 hover:border-primary/40"
                  : "border-[#dfe7e2] hover:border-primary/30"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-lg bg-ocean-soft px-2 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ocean">
                  Step 02
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    isPaymentReady
                      ? "bg-green-100 text-green-700"
                      : "bg-accent-soft text-primary"
                  }`}
                >
                  {isPaymentReady ? "Ready" : "Required for booking"}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-gray-900">
                Configure payments
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Select PayMongo QR Ph or add manual transfer destinations.
              </p>
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                {isPaymentReady ? "Manage payments →" : "Set up now →"}
              </p>
            </Link>
          </div>
        </section>
      )}

      {operational && isPaymentReady && (
        <section className="mt-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
              Operations
            </p>
            <h2 className="mt-1 text-lg font-bold text-navy">
              Run your venue
            </h2>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {shortcuts.map((shortcut) => (
              <Link
                key={shortcut.href}
                href={shortcut.href}
                className="group rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md hover:shadow-navy/5"
              >
                <span
                  className={`flex h-11 w-11 items-center justify-center rounded-xl ${shortcut.tone}`}
                >
                  <DashboardIcon name={shortcut.icon} />
                </span>
                <h3 className="mt-5 font-bold text-navy transition-colors group-hover:text-primary">
                  {shortcut.label}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {shortcut.desc}
                </p>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-navy">
                  {shortcut.action} →
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 flex flex-col gap-4 rounded-2xl border border-[#dfe7e2] bg-white p-5 shadow-sm shadow-navy/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-navy-soft text-navy">
            <DashboardIcon name="account" />
          </span>
          <div>
            <h2 className="font-bold text-navy">Account settings</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Update your business details, contact information, and profile
              picture.
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/account"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-navy transition-colors hover:border-primary/30 hover:bg-primary-soft hover:text-primary"
        >
          Open settings
        </Link>
      </section>
    </div>
  );
}
