"use server";

import { Prisma } from "@prisma/client";
import type { CancelledBy } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import { buildSlots, canBook } from "@/lib/slots";
import { getBookedHours, getCourtForBooking } from "@/lib/bookings";
import {
  CancelBookingSchema,
  CreateBookingSchema,
  PartnerCancelBookingSchema,
} from "@/lib/validation";
import {
  BOOKING_WINDOW_DAYS,
  CANCEL_CUTOFF_HOURS,
} from "@/lib/constants";
import {
  addDays,
  manilaInstant,
  manilaNowHour,
  manilaToday,
} from "@/lib/time";

export type BookingFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  bookingId?: string;
};

// Revalidates every surface a booking or cancellation shows up on.
function revalidateBookingSurfaces(hubId: string) {
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/hubs/${hubId}/bookings`);
  revalidatePath(`/hubs/${hubId}`);
}

export async function createBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  // The UI hides the form from anonymous and non-player visitors, but a Server
  // Action is a public endpoint — it has to defend itself.
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to book a court." };
  if (viewer.role !== "PLAYER") {
    return { message: "Only player accounts can book courts." };
  }

  const parsed = CreateBookingSchema.safeParse({
    courtId: String(formData.get("courtId") ?? ""),
    date: String(formData.get("date") ?? ""),
    startHour: String(formData.get("startHour") ?? ""),
    hours: String(formData.get("hours") ?? ""),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const { courtId, date, startHour, hours, notes } = parsed.data;

  const court = await getCourtForBooking(courtId);
  if (!court) return { message: "Court not found." };

  const today = manilaToday();
  if (date < today) {
    return { errors: { date: "That date has already passed." } };
  }
  if (date > addDays(today, BOOKING_WINDOW_DAYS)) {
    return {
      errors: { date: `Bookings open ${BOOKING_WINDOW_DAYS} days ahead.` },
    };
  }

  // Re-check availability server-side; never trust the grid the client posted.
  // This exists for a good error message — the unique index below is the guard.
  const bookedHours = await getBookedHours(courtId, date);
  const { closed, slots } = buildSlots({
    operatingHours: court.hub.operatingHours,
    date,
    bookedHours,
    today,
    nowHour: manilaNowHour(),
  });
  if (closed) {
    return { errors: { date: "This hub is closed on that day." } };
  }
  if (!canBook(slots, startHour, hours)) {
    return { errors: { startHour: "That time is no longer available." } };
  }

  const endHour = startHour + hours;
  const startsAt = manilaInstant(date, startHour);
  const endsAt = manilaInstant(date, endHour);

  // Don't let a player double-book themselves across two courts.
  const clash = await prisma.booking.findFirst({
    where: {
      userId: viewer.id,
      status: "CONFIRMED",
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true },
  });
  if (clash) {
    return {
      errors: { startHour: "You already have a booking during that time." },
    };
  }

  const totalPrice =
    court.hourlyRate != null ? court.hourlyRate * hours : null;

  let bookingId: string;
  try {
    const created = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.create({
        data: {
          courtId,
          hubId: court.hub.id,
          userId: viewer.id,
          date,
          startHour,
          endHour,
          hours,
          startsAt,
          endsAt,
          hourlyRate: court.hourlyRate,
          totalPrice,
          notes: notes ?? null,
          status: "CONFIRMED",
        },
        select: { id: true },
      });

      // The unique index on (courtId, date, hour) is what actually prevents a
      // double-booking: a concurrent transaction holding the same key makes
      // this block, then fail with P2002 once the other commits — rolling back
      // the Booking row above along with it.
      //
      // Deliberately NOT skipDuplicates: that would swallow the collision and
      // leave a booking whose hours are only partially reserved.
      await tx.bookingSlot.createMany({
        data: Array.from({ length: hours }, (_, i) => ({
          bookingId: booking.id,
          courtId,
          date,
          hour: startHour + i,
        })),
      });

      return booking;
    });
    bookingId = created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { message: "Someone just booked that time. Pick another slot." };
    }
    throw error;
  }

  revalidateBookingSurfaces(court.hub.id);

  // No redirect: the player stays on the hub page and watches the slots they
  // just took grey out.
  return {
    success: `Booked ${court.name} on ${date}.`,
    bookingId,
  };
}

// Cancelling DELETES the BookingSlot rows so those hours become bookable again;
// the Booking survives as CANCELLED for history. See the schema comment.
async function cancelBooking(
  bookingId: string,
  by: CancelledBy,
  reason: string | null
) {
  await prisma.$transaction([
    prisma.bookingSlot.deleteMany({ where: { bookingId } }),
    prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: by,
        cancelReason: reason,
      },
    }),
  ]);
}

export async function cancelMyBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to manage your bookings." };

  const parsed = CancelBookingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Ownership is enforced in the where clause, like deleteHubAction.
  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.id, userId: viewer.id },
    select: { id: true, hubId: true, status: true, startsAt: true },
  });
  if (!booking) return { message: "Booking not found." };
  if (booking.status !== "CONFIRMED") {
    return { message: "That booking is already cancelled." };
  }

  const cutoffMs = CANCEL_CUTOFF_HOURS * 3_600_000;
  if (booking.startsAt.getTime() - Date.now() < cutoffMs) {
    return {
      message: `Bookings can only be cancelled at least ${CANCEL_CUTOFF_HOURS} hours before the start time.`,
    };
  }

  await cancelBooking(booking.id, "PLAYER", parsed.data.reason ?? null);
  revalidateBookingSurfaces(booking.hubId);
  return { success: "Booking cancelled." };
}

export async function cancelHubBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to manage bookings." };
  if (viewer.role !== "PARTNER" && viewer.role !== "ADMIN") {
    return { message: "Only the hub owner can cancel this booking." };
  }

  const parsed = PartnerCancelBookingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Admins can cancel anywhere; partners only within hubs they own.
  const booking = await prisma.booking.findFirst({
    where:
      viewer.role === "ADMIN"
        ? { id: parsed.data.id }
        : { id: parsed.data.id, hub: { ownerId: viewer.id } },
    select: { id: true, hubId: true, status: true, endsAt: true },
  });
  if (!booking) return { message: "Booking not found." };
  if (booking.status !== "CONFIRMED") {
    return { message: "That booking is already cancelled." };
  }
  // A venue can decline any time up until the booking has finished.
  if (booking.endsAt.getTime() < Date.now()) {
    return { message: "That booking has already finished." };
  }

  await cancelBooking(
    booking.id,
    viewer.role === "ADMIN" ? "ADMIN" : "PARTNER",
    parsed.data.reason
  );
  revalidateBookingSurfaces(booking.hubId);
  return { success: "Booking cancelled and the player notified." };
}
