import Link from "next/link";
import type { Metadata } from "next";
import { Avatar } from "@/components/ui/Avatar";
import { DeleteHubButton } from "@/components/dashboard/hubs/DeleteHubButton";
import { listMyHubs } from "@/lib/hubs";
import { requireActivePartner } from "@/lib/dal";
import { getActivePartnerGateway } from "@/lib/partner-gateway";

export const metadata: Metadata = {
  title: "My Hubs — Bunal.ph",
};

export default async function HubsPage() {
  const partner = await requireActivePartner();
  const [hubs, gateway] = await Promise.all([
    listMyHubs(),
    getActivePartnerGateway(partner.id),
  ]);

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Hubs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create and manage your venues and clubs.
          </p>
        </div>
        <Link
          href={
            gateway
              ? "/dashboard/hubs/new"
              : "/dashboard/payments?setup=hub"
          }
          className="shrink-0 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
        >
          {gateway ? "+ New hub" : "Connect PayMongo first"}
        </Link>
      </div>

      {!gateway && (
        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-800">
            Connect PayMongo before adding a hub
          </p>
          <p className="mt-0.5 text-sm text-amber-700">
            Players need a working checkout before a venue can accept
            bookings. Connect your own PayMongo account first
            {hubs.length > 0
              ? "; your existing hubs will also return to the public directory."
              : ", then you can create and publish your first hub."}
          </p>
          <Link
            href="/dashboard/payments?setup=hub"
            className="mt-2 inline-block text-sm font-semibold text-amber-900 hover:underline"
          >
            Set up payments →
          </Link>
        </div>
      )}

      {hubs.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 px-6 py-16 text-center">
          <p className="max-w-sm text-sm text-gray-500">
            {gateway
              ? "Your payment gateway is ready. Add your first venue to start accepting bookings."
              : "Start by connecting the PayMongo account that will receive player booking payments."}
          </p>
          <Link
            href={
              gateway
                ? "/dashboard/hubs/new"
                : "/dashboard/payments?setup=hub"
            }
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            {gateway ? "Create your first hub" : "Connect PayMongo"}
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {hubs.map((hub) => (
            <div
              key={hub.id}
              className="overflow-hidden rounded-2xl border border-gray-200"
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
                  <div className="flex h-full w-full items-center justify-center text-sm text-gray-400">
                    No cover photo
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 p-4">
                <Avatar src={hub.logo} name={hub.name} size={44} />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-semibold text-gray-900">
                    {hub.name}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {[hub.phone, hub.email].filter(Boolean).join(" · ") ||
                      "No contact info"}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 border-t border-gray-100 px-3 py-2">
                <Link
                  href={`/hubs/${hub.id}`}
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
                  href={`/dashboard/hubs/${hub.id}/edit`}
                  className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft"
                >
                  Edit
                </Link>
                <DeleteHubButton hubId={hub.id} name={hub.name} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
