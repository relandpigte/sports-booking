import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMyHub } from "@/lib/hubs";
import { listHubBookings } from "@/lib/bookings";
import { BookingCard } from "@/components/bookings/BookingCard";
import { manilaNowHour, manilaToday } from "@/lib/time";
import { hasStaffAccess, requirePartnerWorkspace } from "@/lib/staffing";

export const metadata: Metadata = {
  title: "Hub Bookings — Bunal.club",
};

export default async function HubBookingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspace = await requirePartnerWorkspace("bookings");
  const canManage = hasStaffAccess(workspace, "bookings", "MANAGE");
  const canMessage = hasStaffAccess(workspace, "messages", "VIEW");
  // Both are ownership-scoped; either returning null means it isn't this
  // partner's hub.
  const [hub, bookings] = await Promise.all([
    getMyHub(id, workspace.partnerId),
    listHubBookings(id, workspace.partnerId),
  ]);
  if (!hub || !bookings) notFound();

  const { upcoming, past } = bookings;

  // Everything the reschedule picker needs. Only upcoming bookings get it.
  const reschedule = {
    courts: hub.courts,
    operatingHours: hub.operatingHours,
    today: manilaToday(),
    nowHour: manilaNowHour(),
  };

  return (
    <div>
      <Link
        href="/dashboard/hubs"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Back to hubs
      </Link>

      <div className="mt-3">
        <h1 className="text-2xl font-bold text-gray-900">{hub.name}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Court bookings made by players.
        </p>
      </div>

      <section className="mt-6">
        <h2 className="text-base font-semibold text-gray-900">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {upcoming.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                view="partner"
                cancellable={canManage}
                manageable={canManage}
                canMessage={canMessage}
                reschedule={canManage ? reschedule : undefined}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No upcoming bookings yet.
          </p>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <h2 className="text-base font-semibold text-gray-900">History</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {past.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                view="partner"
                cancellable={false}
                manageable={canManage}
                canMessage={canMessage}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
