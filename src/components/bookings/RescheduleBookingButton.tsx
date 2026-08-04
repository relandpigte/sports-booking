"use client";

import { useState } from "react";

import { RescheduleBookingPanel } from "@/components/bookings/RescheduleBookingPanel";
import { usePwa } from "@/components/pwa/PwaProvider";
import type { OperatingHours } from "@/lib/constants";
import type { CourtScheduleRule } from "@/lib/slots";

type PanelCourt = {
  id: string;
  name: string;
  courtType: string;
  hourlyRate: number | null;
  scheduleRules: CourtScheduleRule[];
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
  const { isOnline } = usePwa();

  if (!open) {
    return (
      <button
        type="button"
        disabled={!isOnline}
        title={!isOnline ? "Reconnect to reschedule this booking." : undefined}
        onClick={() => setOpen(true)}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
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
