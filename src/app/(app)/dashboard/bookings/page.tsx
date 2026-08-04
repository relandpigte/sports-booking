import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/dal";
import { listMyBookings, listPartnerBookings } from "@/lib/bookings";
import { listMyHubs } from "@/lib/hubs";
import { BookingCard } from "@/components/bookings/BookingCard";
import { PartnerBookingListRow } from "@/components/bookings/PartnerBookingListRow";
import { PartnerBookingsView } from "@/components/bookings/PartnerBookingsView";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { manilaNowHour, manilaToday } from "@/lib/time";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";

export const metadata: Metadata = {
  title: "Bookings — Bunal.club",
};

export default async function BookingsPage() {
  const [user, impersonation] = await Promise.all([
    getCurrentUser(),
    getCurrentPartnerImpersonation(),
  ]);
  if (!user || user.role === "ADMIN") redirect("/dashboard");
  if (
    user.role === "PARTNER" &&
    user.partnerStatus !== "ACTIVE" &&
    impersonation?.partner.id !== user.id
  ) {
    redirect("/dashboard/partner");
  }

  if (user.role === "PARTNER") {
    const [bookings, hubs] = await Promise.all([
      listPartnerBookings(),
      listMyHubs(),
    ]);
    const rescheduleByHub = new Map(
      hubs.map((hub) => [
        hub.id,
        {
          courts: hub.courts,
          operatingHours: hub.operatingHours,
          today: manilaToday(),
          nowHour: manilaNowHour(),
        },
      ])
    );

    return (
      <PartnerBookingsView
        upcomingCount={bookings.upcoming.length}
        historyCount={bookings.past.length}
        upcomingList={bookings.upcoming.map((booking) => (
          <PartnerBookingListRow
            key={booking.id}
            booking={booking}
            cancellable
            reschedule={rescheduleByHub.get(booking.hub.id)}
          />
        ))}
        upcomingGrid={bookings.upcoming.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            view="partner"
            cancellable
            reschedule={rescheduleByHub.get(booking.hub.id)}
          />
        ))}
        historyList={bookings.past.map((booking) => (
          <PartnerBookingListRow
            key={booking.id}
            booking={booking}
            cancellable={false}
          />
        ))}
        historyGrid={bookings.past.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            view="partner"
            cancellable={false}
          />
        ))}
      />
    );
  }

  const { upcoming, past } = await listMyBookings();

  return (
    <div>
      <DashboardPageHeader
        eyebrow="Your schedule"
        title="Bookings"
        description="Reserve courts and manage your upcoming game sessions."
      />

      <section className="mt-6">
        <h2 className="text-base font-semibold text-gray-900">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length > 0 ? (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} view="player" cancellable />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-gray-300 p-8 text-center">
            <p className="text-sm text-gray-500">
              You have no upcoming bookings.
            </p>
            <Link
              href="/hubs"
              className="mt-3 inline-block rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
            >
              Find a court
            </Link>
          </div>
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
                view="player"
                cancellable={false}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
