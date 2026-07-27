"use client";

import { useState } from "react";

import { RescheduleBookingPanel } from "@/components/bookings/RescheduleBookingPanel";
import type { OperatingHours } from "@/lib/constants";

type PanelCourt = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
};

// Keeps the picker — and the EventSource it opens — unmounted until a partner
// actually wants to move something. A hub list can hold many bookings.
export function RescheduleBookingButton({
  bookingId,
  courts,
  operatingHours,
  today,
  nowHour,
  current,
}: {
  bookingId: string;
  courts: PanelCourt[];
  operatingHours: OperatingHours | null;
  today: string;
  nowHour: number;
  current: {
    courtId: string;
    courtName: string;
    date: string;
    startHour: number;
    endHour: number;
    totalPrice: number | null;
  };
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft"
      >
        Reschedule
      </button>
    );
  }

  return (
    <div className="w-full">
      <RescheduleBookingPanel
        bookingId={bookingId}
        courts={courts}
        operatingHours={operatingHours}
        today={today}
        nowHour={nowHour}
        current={current}
        onDone={() => setOpen(false)}
      />
    </div>
  );
}
