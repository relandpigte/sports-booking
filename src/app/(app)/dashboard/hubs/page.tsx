import Link from "next/link";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui/Avatar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DeleteHubButton } from "@/components/dashboard/hubs/DeleteHubButton";
import { HubCoverFallback } from "@/components/hubs/HubCoverFallback";
import { listMyHubs } from "@/lib/hubs";
import {
  getPartnerPaymentSetup,
  isPartnerPaymentReady,
} from "@/lib/manual-payments";
import { hubPublicPath } from "@/lib/hub-slug";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "My Hubs — Bunal.club",
};

export default async function HubsPage() {
  const workspace = await requirePartnerWorkspace("hubs");
  const canManage = hasStaffAccess(workspace, "hubs", "MANAGE");
  const canManagePayments = hasStaffAccess(workspace, "payments", "MANAGE");
  const isOwner = workspace.kind === "OWNER";
  const [hubs, paymentSetup] = await Promise.all([
    listMyHubs(workspace.partnerId),
    getPartnerPaymentSetup(workspace.partnerId),
  ]);
  const paymentReady = isPartnerPaymentReady(paymentSetup);

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Venue management"
        title="My hubs"
        description="Create and manage your venues, courts, rates, and operating hours."
        actions={isOwner ? (
          <Link
            href="/dashboard/hubs/new"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-primary-hover"
          >
            + New hub
          </Link>
        ) : undefined}
      />

      {!paymentReady && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            Publish now, open bookings when payments are ready
          </p>
          <p className="mt-0.5 text-sm text-amber-700">
            You can create your hub now. After you add a court, approved venues
            appear publicly as Coming soon until your selected payment setup
            is ready. Online booking stays disabled in the meantime.
          </p>
          {canManagePayments && (
            <Link
              href="/dashboard/payments?setup=hub"
              className="mt-2 inline-block text-sm font-semibold text-amber-900 hover:underline"
            >
              Set up payments →
            </Link>
          )}
        </div>
      )}

      {hubs.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-gray-500">
            {paymentReady
              ? "Your payment setup is ready. Add your first venue to start accepting bookings."
              : "Create your first venue now. It can appear as Coming soon while you finish the selected payment setup."}
          </p>
          {isOwner && (
            <Link
              href="/dashboard/hubs/new"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
            >
              Create your first hub
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {hubs.map((hub) => (
            <div
              key={hub.id}
              className="overflow-hidden rounded-2xl border border-[#dfe7e2] bg-white shadow-sm shadow-navy/5"
            >
              <div className="relative aspect-video bg-gray-100">
                {hub.coverPhotos[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hub.coverPhotos[0]}
                    alt={`${hub.name} cover`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <HubCoverFallback hubName={hub.name} />
                )}
              </div>
              <div className="flex items-start gap-3 p-4">
                <Avatar src={hub.logo} name={hub.name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold text-gray-900">
                      {hub.name}
                    </h2>
                    {!paymentReady && hub.courts.length > 0 ? (
                      <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-accent">
                        Coming soon
                      </span>
                    ) : hub.courts.length === 0 ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                        Draft
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[hub.phone, hub.email].filter(Boolean).join(" · ") ||
                      "No contact info"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-3 py-2">
                <a
                  href={`/api/hubs/${hub.id}/qr`}
                  download
                  className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  title={`Download a branded QR code for ${hub.name}`}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="6" height="6" />
                    <rect x="15" y="3" width="6" height="6" />
                    <rect x="3" y="15" width="6" height="6" />
                    <path d="M15 15h2v2h-2zM19 15h2v6h-6v-2M15 19h2" />
                  </svg>
                  QR code
                </a>
                <Link
                  href={hubPublicPath(hub)}
                  target="_blank"
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  View
                </Link>
                <Link
                  href={`/dashboard/hubs/${hub.id}/bookings`}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Bookings
                </Link>
                <Link
                  href={`/dashboard/hubs/${hub.id}/schedule`}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Schedule
                </Link>
                {canManage && (
                  <Link
                    href={`/dashboard/hubs/${hub.id}/edit`}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft"
                  >
                    Edit
                  </Link>
                )}
                {isOwner && <DeleteHubButton hubId={hub.id} name={hub.name} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
