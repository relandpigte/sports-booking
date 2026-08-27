import Link from "next/link";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui/Avatar";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DeleteHubButton } from "@/components/dashboard/hubs/DeleteHubButton";
import { HubQrDownloadButton } from "@/components/dashboard/hubs/HubQrDownloadButton";
import { HubCoverFallback } from "@/components/hubs/HubCoverFallback";
import { ShareButton } from "@/components/ShareButton";
import { listMyHubs } from "@/lib/hubs";
import {
  getPartnerPaymentSetup,
  isPartnerPaymentReady,
} from "@/lib/manual-payments";
import { hubPublicPath } from "@/lib/hub-slug";
import { absoluteUrl } from "@/lib/site";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "My Hubs — Bunal.club",
};

const hubActionClassName =
  "flex min-h-11 items-center justify-start gap-2 rounded-xl bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-600 ring-1 ring-inset ring-gray-200 transition-colors hover:bg-gray-100";

const hubEditActionClassName =
  "flex min-h-11 items-center justify-start gap-2 rounded-xl bg-gray-50 px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-inset ring-gray-200 transition-colors hover:bg-primary-soft";

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
                <div className="absolute right-3 top-3 z-20">
                  <ShareButton
                    title={hub.name}
                    url={absoluteUrl(hubPublicPath(hub))}
                    subject="hub"
                    variant="media"
                  />
                </div>
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
              <div className="grid grid-cols-2 gap-2 border-t border-gray-100 px-4 py-3">
                <p className="col-span-2 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
                  Hub actions
                </p>
                <HubQrDownloadButton
                  src={`/api/hubs/${hub.id}/qr`}
                  hubName={hub.name}
                />
                <Link
                  href={hubPublicPath(hub)}
                  target="_blank"
                  className={hubActionClassName}
                >
                  <HubActionIcon name="view" />
                  View hub
                </Link>
                <Link
                  href={`/dashboard/hubs/${hub.id}/bookings`}
                  className={hubActionClassName}
                >
                  <HubActionIcon name="bookings" />
                  Bookings
                </Link>
                <Link
                  href={`/dashboard/hubs/${hub.id}/schedule`}
                  className={hubActionClassName}
                >
                  <HubActionIcon name="schedule" />
                  Schedule
                </Link>
                {canManage && (
                  <Link
                    href={`/dashboard/hubs/${hub.id}/edit`}
                    className={hubEditActionClassName}
                  >
                    <HubActionIcon name="edit" />
                    Edit hub
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

function HubActionIcon({
  name,
}: {
  name: "bookings" | "edit" | "schedule" | "view";
}) {
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "view" ? (
        <>
          <path d="M14 3h7v7" />
          <path d="M10 14 21 3" />
          <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
        </>
      ) : name === "bookings" ? (
        <>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </>
      ) : name === "schedule" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </>
      ) : (
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
        </>
      )}
    </svg>
  );
}
