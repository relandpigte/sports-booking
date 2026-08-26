"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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
  hubId,
  courts,
  operatingHours,
  today,
  nowHour,
  current,
}: {
  bookingId: string;
  hubId: string;
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { isOnline } = usePwa();

  function closeDialog() {
    if (dialogRef.current?.open) dialogRef.current.close();
    else setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={!isOnline}
        title={!isOnline ? "Reconnect to reschedule this booking." : undefined}
        onClick={() => setOpen(true)}
        className="rounded-md px-2.5 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-50"
      >
        Reschedule
      </button>
      {open && (
        <RescheduleDialog
          dialogRef={dialogRef}
          onClose={() => setOpen(false)}
        >
          <RescheduleBookingPanel
            bookingId={bookingId}
            hubId={hubId}
            courts={courts}
            operatingHours={operatingHours}
            today={today}
            nowHour={nowHour}
            current={current}
            onDone={closeDialog}
          />
        </RescheduleDialog>
      )}
    </>
  );
}

function RescheduleDialog({
  dialogRef,
  onClose,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [dialogRef]);

  function close() {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="reschedule-dialog-title"
      aria-describedby="reschedule-dialog-description"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) close();
      }}
      className="m-auto h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-7xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-navy/60 sm:h-[calc(100dvh-2rem)] sm:w-[calc(100%-2rem)] sm:rounded-3xl"
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-gray-200 px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h2
              id="reschedule-dialog-title"
              className="text-lg font-extrabold text-navy sm:text-xl"
            >
              Reschedule booking
            </h2>
            <p
              id="reschedule-dialog-description"
              className="mt-1 text-sm text-gray-500"
            >
              Compare every court, then move the booking without changing its duration.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close reschedule booking"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-navy"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
