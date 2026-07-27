"use server";

import { Prisma } from "@prisma/client";
import type { CancelledBy } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getViewer } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import { buildSlots, isAvailable, runHours, toRuns } from "@/lib/slots";
import {
  getBookedHours,
  getBookedHoursExcluding,
  getCourtForBooking,
} from "@/lib/bookings";
import {
  CancelBookingSchema,
  CreateBookingSchema,
  PartnerCancelBookingSchema,
  RescheduleBookingSchema,
} from "@/lib/validation";
import {
  BOOKING_WINDOW_DAYS,
  CANCEL_CUTOFF_HOURS,
} from "@/lib/constants";
import {
  addDays,
  formatHourLabel,
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
    hours: formData.getAll("hours").map((v) => String(v)),
    notes: String(formData.get("notes") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const { courtId, date, hours, notes } = parsed.data;

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
  const unavailable = hours.filter((h) => !isAvailable(slots, h));
  if (unavailable.length > 0) {
    return {
      errors: {
        hours: `${unavailable
          .map(formatHourLabel)
          .join(", ")} ${unavailable.length === 1 ? "is" : "are"} no longer available.`,
      },
    };
  }

  // The hours need not be contiguous, so a selection can span several
  // sessions. Each run becomes its own booking the player can cancel on its
  // own, while a single unbroken block still produces exactly one booking.
  const runs = toRuns(hours);

  // Don't let a player double-book themselves across two courts.
  for (const run of runs) {
    const clash = await prisma.booking.findFirst({
      where: {
        userId: viewer.id,
        status: "CONFIRMED",
        startsAt: { lt: manilaInstant(date, run.end + 1) },
        endsAt: { gt: manilaInstant(date, run.start) },
      },
      select: { id: true },
    });
    if (clash) {
      return {
        errors: {
          hours: `You already have a booking at ${formatHourLabel(run.start)}.`,
        },
      };
    }
  }

  let created: { id: string }[];
  try {
    // One transaction for the whole selection: if any hour is taken while we
    // write, the player gets none of them rather than a partial set they
    // didn't ask for.
    created = await prisma.$transaction(async (tx) => {
      const out: { id: string }[] = [];

      for (const run of runs) {
        const runLength = runHours(run);
        const booking = await tx.booking.create({
          data: {
            courtId,
            hubId: court.hub.id,
            userId: viewer.id,
            date,
            startHour: run.start,
            endHour: run.end + 1,
            hours: runLength,
            startsAt: manilaInstant(date, run.start),
            endsAt: manilaInstant(date, run.end + 1),
            hourlyRate: court.hourlyRate,
            totalPrice:
              court.hourlyRate != null ? court.hourlyRate * runLength : null,
            notes: notes ?? null,
            status: "CONFIRMED",
          },
          select: { id: true },
        });

        // The unique index on (courtId, date, hour) is what actually prevents a
        // double-booking: a concurrent transaction holding the same key makes
        // this block, then fail with P2002 once the other commits — rolling
        // back every booking in this transaction along with it.
        //
        // Deliberately NOT skipDuplicates: that would swallow the collision and
        // leave a booking whose hours are only partially reserved.
        await tx.bookingSlot.createMany({
          data: Array.from({ length: runLength }, (_, i) => ({
            bookingId: booking.id,
            courtId,
            date,
            hour: run.start + i,
          })),
        });

        out.push(booking);
      }

      return out;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { message: "Someone just booked one of those hours. Try again." };
    }
    throw error;
  }

  revalidateBookingSurfaces(court.hub.id);

  // No redirect: the player stays on the hub page and watches the slots they
  // just took grey out.
  return {
    success:
      created.length === 1
        ? `Booked ${court.name} on ${date}.`
        : `Booked ${created.length} sessions on ${court.name}.`,
    bookingId: created[0].id,
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

// An interactive transaction can only be aborted by throwing, so these carry
// the two business failures back out of it.
class StaleBooking extends Error {}
class PlayerClash extends Error {}

// Moves a booking to a different court / date / time within the same hub.
// Venue-initiated only — players cancel and rebook instead.
export async function rescheduleHubBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to manage bookings." };
  if (viewer.role !== "PARTNER" && viewer.role !== "ADMIN") {
    return { message: "Only the hub owner can move this booking." };
  }

  const parsed = RescheduleBookingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    courtId: String(formData.get("courtId") ?? ""),
    date: String(formData.get("date") ?? ""),
    hours: formData.getAll("hours").map((v) => String(v)),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const { id, courtId, date, hours, reason } = parsed.data;

  // Admins can move anything; partners only within hubs they own.
  const booking = await prisma.booking.findFirst({
    where:
      viewer.role === "ADMIN" ? { id } : { id, hub: { ownerId: viewer.id } },
    select: {
      id: true,
      hubId: true,
      userId: true,
      courtId: true,
      date: true,
      startHour: true,
      endHour: true,
      status: true,
      endsAt: true,
      totalPrice: true,
      court: { select: { name: true } },
    },
  });
  if (!booking) return { message: "Booking not found." };
  if (booking.status !== "CONFIRMED") {
    return { message: "That booking is cancelled." };
  }
  if (booking.endsAt.getTime() < Date.now()) {
    return { message: "That booking has already finished." };
  }

  const court = await getCourtForBooking(courtId);
  if (!court) return { errors: { courtId: "Court not found." } };
  // This is what makes moving a booking to another venue impossible — and it
  // constrains ADMIN too, who is otherwise unscoped.
  if (court.hub.id !== booking.hubId) {
    return { errors: { courtId: "That court belongs to another venue." } };
  }

  const today = manilaToday();
  if (date < today) {
    return { errors: { date: "That date has already passed." } };
  }
  if (date > addDays(today, BOOKING_WINDOW_DAYS)) {
    return {
      errors: { date: `Bookings open ${BOOKING_WINDOW_DAYS} days ahead.` },
    };
  }

  // Re-check availability server-side, ignoring this booking's own slots so
  // keeping some of its current hours isn't read as a clash. For the error
  // message only — the unique index is the actual guard.
  const bookedHours = await getBookedHoursExcluding(courtId, date, booking.id);
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
  const unavailable = hours.filter((h) => !isAvailable(slots, h));
  if (unavailable.length > 0) {
    return {
      errors: {
        hours: `${unavailable
          .map(formatHourLabel)
          .join(", ")} ${unavailable.length === 1 ? "is" : "are"} no longer available.`,
      },
    };
  }

  // The schema guarantees the hours are contiguous, so min/max is the run.
  const startHour = Math.min(...hours);
  const endHour = Math.max(...hours) + 1;
  const newHours = endHour - startHour;
  const startsAt = manilaInstant(date, startHour);
  const endsAt = manilaInstant(date, endHour);

  if (
    courtId === booking.courtId &&
    date === booking.date &&
    startHour === booking.startHour &&
    endHour === booking.endHour
  ) {
    return { message: "Pick a different court, date or time." };
  }

  // Re-snapshot from the new court's current rate: the old snapshot may belong
  // to a different court entirely, and the length may have changed.
  const totalPrice =
    court.hourlyRate != null ? court.hourlyRate * newHours : null;

  try {
    await prisma.$transaction(async (tx) => {
      // The checks above ran outside the transaction; the player may have
      // cancelled since.
      const fresh = await tx.booking.findUnique({
        where: { id: booking.id },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "CONFIRMED") throw new StaleBooking();

      // Don't leave the PLAYER double-booked — excluding the booking being
      // moved, or it would always clash with itself and no move could succeed.
      const clash = await tx.booking.findFirst({
        where: {
          userId: booking.userId,
          id: { not: booking.id },
          status: "CONFIRMED",
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { id: true },
      });
      if (clash) throw new PlayerClash();

      // 1. Free this booking's OWN hours first.
      //
      // This ordering is what makes an overlapping move possible: 6–8 PM ->
      // 7–9 PM reuses 7 PM, and the unique index would reject re-inserting a
      // key we still hold. It's safe because the delete is invisible outside
      // this transaction until commit — a concurrent booker aiming at 6 PM
      // blocks on our row lock, then succeeds if we commit (the hour really
      // was freed) or fails with P2002 if we roll back (it's still ours).
      await tx.bookingSlot.deleteMany({ where: { bookingId: booking.id } });

      // 2. Claim the NEW hours. The unique index is the guard: a concurrent
      //    transaction holding one of these keys makes this block, then fail
      //    with P2002 — which rolls back the delete above too, so the booking
      //    keeps its ORIGINAL hours. Nothing partial survives.
      //
      //    Deliberately NOT skipDuplicates: that would swallow the collision.
      await tx.bookingSlot.createMany({
        data: Array.from({ length: newHours }, (_, i) => ({
          bookingId: booking.id,
          courtId,
          date,
          hour: startHour + i,
        })),
      });

      // 3. Move the booking and snapshot where it came from.
      await tx.booking.update({
        where: { id: booking.id, status: "CONFIRMED" },
        data: {
          courtId,
          date,
          startHour,
          endHour,
          hours: newHours,
          startsAt,
          endsAt,
          hourlyRate: court.hourlyRate,
          totalPrice,
          prevCourtName: booking.court.name,
          prevDate: booking.date,
          prevStartHour: booking.startHour,
          prevEndHour: booking.endHour,
          prevTotalPrice: booking.totalPrice,
          rescheduledAt: new Date(),
          rescheduledBy: viewer.role === "ADMIN" ? "ADMIN" : "PARTNER",
          rescheduleReason: reason,
          rescheduleCount: { increment: 1 },
        },
      });
    });
  } catch (error) {
    if (error instanceof StaleBooking) {
      return { message: "That booking changed — refresh and try again." };
    }
    if (error instanceof PlayerClash) {
      return { errors: { hours: "The player already has a booking then." } };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      // Someone took one of the new hours mid-write. The whole transaction
      // rolled back, so the booking still holds its original hours.
      if (error.code === "P2002") {
        return { message: "Someone just booked one of those hours. Try again." };
      }
      // Write conflict/deadlock, or cancelled between the re-read and update.
      if (error.code === "P2034" || error.code === "P2025") {
        return { message: "That booking changed — refresh and try again." };
      }
    }
    throw error;
  }

  revalidateBookingSurfaces(booking.hubId);
  return { success: "Booking moved and the player notified." };
}
