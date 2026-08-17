import Link from "next/link";

import { DashboardIcon } from "@/components/dashboard/DashboardIcon";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import {
  STAFF_MODULES,
  type PartnerWorkspace,
  type StaffModule,
} from "@/lib/staffing";

const moduleDetails: Record<
  StaffModule,
  { label: string; href: string; description: string }
> = {
  hubs: {
    label: "Hubs",
    href: "/dashboard/hubs",
    description: "Venue details, courts, rates, and operating schedules.",
  },
  bookings: {
    label: "Bookings",
    href: "/dashboard/bookings",
    description: "Reservations, receipts, refunds, and court operations.",
  },
  events: {
    label: "Events",
    href: "/dashboard/events",
    description: "Open play sessions, attendees, and registrations.",
  },
  reports: {
    label: "Reports",
    href: "/dashboard/reports",
    description: "Revenue and venue performance reporting.",
  },
  messages: {
    label: "Messages",
    href: "/dashboard/messages",
    description: "Venue-player and event conversations.",
  },
  payments: {
    label: "Payments",
    href: "/dashboard/payments",
    description: "Checkout configuration and payment status.",
  },
};

export function StaffHome({ workspace }: { workspace: PartnerWorkspace }) {
  const enabled = STAFF_MODULES.filter(
    (module) => workspace.permissions[module] !== "NONE"
  );
  return (
    <div>
      <DashboardPageHeader
        eyebrow="Staff workspace"
        title={workspace.partnerName}
        description="Manage the venue modules assigned to you by the partner owner."
      />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {enabled.map((module) => {
          const details = moduleDetails[module];
          const access = workspace.permissions[module];
          return (
            <Link
              key={module}
              href={details.href}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <DashboardIcon
                    name={
                      module === "bookings"
                        ? "booking"
                        : module === "events"
                          ? "trophy"
                          : module === "reports"
                            ? "report"
                            : module === "payments"
                              ? "payment"
                              : module === "messages"
                                ? "message"
                                : "hub"
                    }
                  />
                </span>
                <span className="rounded-full bg-navy-soft px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-navy">
                  {access === "MANAGE" ? "Manage" : "View only"}
                </span>
              </div>
              <h2 className="mt-4 font-black text-navy">{details.label}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {details.description}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
