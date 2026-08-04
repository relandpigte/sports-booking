import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/dal";
import { listMyBookings, listPartnerBookings } from "@/lib/bookings";
import { listMyHubs } from "@/lib/hubs";
import { BookingCard } from "@/components/bookings/BookingCard";
import { PartnerBookingListRow } from "@/components/bookings/PartnerBookingListRow";
import { PartnerBookingsView } from "@/components/bookings/PartnerBookingsView";
import { PlayerBookingsView } from "@/components/bookings/PlayerBookingsView";
import { PlayerEventRegistrationCard } from "@/components/bookings/PlayerEventRegistrationCard";
import { manilaNowHour, manilaToday } from "@/lib/time";
import { getCurrentPartnerImpersonation } from "@/lib/impersonation";
import { listMyEventRegistrations } from "@/lib/events";

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

  const [courtBookings, eventRegistrations] = await Promise.all([
    listMyBookings(),
    listMyEventRegistrations(),
  ]);

  return (
    <PlayerBookingsView
      upcomingCourtCount={courtBookings.upcoming.length}
      pastCourtCount={courtBookings.past.length}
      upcomingEventCount={eventRegistrations.upcoming.length}
      pastEventCount={eventRegistrations.past.length}
      upcomingCourts={courtBookings.upcoming.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          view="player"
          cancellable
        />
      ))}
      pastCourts={courtBookings.past.map((booking) => (
        <BookingCard
          key={booking.id}
          booking={booking}
          view="player"
          cancellable={false}
        />
      ))}
      upcomingEvents={eventRegistrations.upcoming.map((registration) => (
        <PlayerEventRegistrationCard
          key={registration.id}
          registration={registration}
        />
      ))}
      pastEvents={eventRegistrations.past.map((registration) => (
        <PlayerEventRegistrationCard
          key={registration.id}
          registration={registration}
        />
      ))}
    />
  );
}
