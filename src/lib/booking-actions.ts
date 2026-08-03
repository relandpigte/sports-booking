"use server";

import { Prisma } from "@prisma/client";
import type { CancelledBy } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { lockPlayerBookingHours } from "@/lib/booking-locks";
import { getActivePartnerGateway } from "@/lib/partner-gateway";
import { getViewer } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import {
  buildSlots,
  isAvailable,
  runHours,
  slotTotal,
  toRuns,
  uniformSlotRate,
} from "@/lib/slots";
import {
  getBookedHours,
  getBookedHoursExcluding,
  getCourtForBooking,
  liveBookingWhere,
} from "@/lib/bookings";
import {
  CreateBookingSchema,
  PartnerCancelBookingSchema,
  RefundBookingSchema,
  RescheduleBookingSchema,
} from "@/lib/validation";
import { refundBookingPayment } from "@/lib/booking-payments";
import {
  BOOKING_HOLD_MINUTES,
  BOOKING_WINDOW_DAYS,
  bookingServiceFeeFor,
  grossFor,
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

// An interactive transaction can only be aborted by throwing, so these carry
// business failures back out of it.
class StaleBooking extends Error {}
class PlayerClash extends Error {}

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

  const { courtId, date, notes } = parsed.data;
  // A crafted form can repeat the same checkbox value. Normalize before
  // pricing, locking, and writing so one court-hour is represented exactly
  // once throughout the transaction.
  const hours = [...new Set(parsed.data.hours)].sort(
    (left, right) => left - right
  );

  const court = await getCourtForBooking(courtId);
  if (!court) return { message: "Court not found." };

  // The hub page hides the panel when a venue cannot accept bookings, but a
  // Server Action is a public endpoint and has to enforce it too.
  if (!court.hub.bookable) {
    return { message: "This venue isn't taking online bookings right now." };
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

  // Re-check availability server-side; never trust the grid the client posted.
  // This exists for a good error message — the unique index below is the guard.
  const bookedHours = await getBookedHours(courtId, date);
  const { closed, slots } = buildSlots({
    operatingHours: court.hub.operatingHours,
    date,
    bookedHours,
    today,
    nowHour: manilaNowHour(),
    courtHourlyRate: court.hourlyRate,
    scheduleRules: court.scheduleRules,
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
  // sessions. Each run becomes its own booking, while a single unbroken block
  // still produces exactly one.
  const runs = toRuns(hours);

  // Don't let a player double-book themselves across two courts.
  for (const run of runs) {
    const clash = await prisma.booking.findFirst({
      where: {
        userId: viewer.id,
        // A live unpaid hold counts — otherwise a player could hold the same
        // hour on two courts at once.
        ...liveBookingWhere(),
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

  // Does this venue take money online? A partner who hasn't connected a
  // gateway keeps the original behaviour exactly: instant confirmation, settle
  // at the venue. So does a court with no hourly rate — there's nothing to
  // charge for, and a ₱0 checkout is a dead end, not a payment.
  const gateway = await getActivePartnerGateway(court.hub.ownerId);
  const total = slotTotal(slots, hours);
  const requiresPayment = gateway != null && total != null && total > 0;

  const now = new Date();
  const holdExpiresAt = requiresPayment
    ? new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60_000)
    : null;

  let created: { id: string }[];
  let paymentId: string | null = null;
  try {
    // One transaction for the whole selection: if any hour is taken while we
    // write, the player gets none of them rather than a partial set they
    // didn't ask for.
    created = await prisma.$transaction(async (tx) => {
      const out: { id: string }[] = [];

      await lockPlayerBookingHours(tx, viewer.id, date, hours);

      // Re-check after taking the player-hour locks. Concurrent requests for
      // different courts now serialize here, so only the first can proceed.
      for (const run of runs) {
        const clash = await tx.booking.findFirst({
          where: {
            userId: viewer.id,
            ...liveBookingWhere(),
            startsAt: { lt: manilaInstant(date, run.end + 1) },
            endsAt: { gt: manilaInstant(date, run.start) },
          },
          select: { id: true },
        });
        if (clash) throw new PlayerClash();
      }

      // Reap DEAD holds for exactly the keys we're about to claim. The unique
      // index doesn't know about time: an expired hold's row is still
      // physically present and would reject our insert even though the grid
      // correctly showed the hour as free.
      //
      // Whoever locks the row first wins. If a settling payment nulls
      // holdExpiresAt just before us, this matches nothing and our createMany
      // fails with P2002 — which is correct, because that hour really was
      // theirs.
      await tx.bookingSlot.deleteMany({
        where: {
          courtId,
          date,
          hour: { in: hours },
          holdExpiresAt: { lt: now },
        },
      });

      if (requiresPayment) {
        // The ledger row BEFORE any money moves, so a crash mid-charge leaves
        // something the sweep can reconcile rather than a silent hole. The
        // method is a placeholder until the player picks one on the pay page —
        // chargeBookingPayment overwrites it as it claims the charge.
        const payment = await tx.bookingPayment.create({
          data: {
            partnerId: court.hub.ownerId,
            gatewayId: gateway!.id,
            userId: viewer.id,
            hubId: court.hub.id,
            // The checkout subtotal before PayMongo's method-specific pass-on
            // processing fee. The other two are snapshotted so a report next
            // year still reads the rate that was quoted today.
            amount: new Prisma.Decimal(grossFor(total!)),
            venueAmount: new Prisma.Decimal(total!),
            platformFee: new Prisma.Decimal(bookingServiceFeeFor(total!)),
            method: "CARD",
            status: "PENDING",
            expiresAt: holdExpiresAt!,
            provider: gateway!.provider,
          },
          select: { id: true },
        });
        paymentId = payment.id;
      }

      for (const run of runs) {
        const runLength = runHours(run);
        const runHourValues = Array.from(
          { length: runLength },
          (_, i) => run.start + i
        );
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
            hourlyRate: uniformSlotRate(slots, runHourValues),
            totalPrice: slotTotal(slots, runHourValues),
            notes: notes ?? null,
            // Pay-to-confirm only when there's a gateway to pay through.
            status: requiresPayment ? "PENDING" : "CONFIRMED",
            holdExpiresAt,
            bookingPaymentId: paymentId,
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
            // Mirrors the booking's hold — see the schema comment for why the
            // grid can't afford to join Booking to find this out.
            holdExpiresAt,
          })),
        });

        out.push(booking);
      }

      return out;
    });
  } catch (error) {
    if (error instanceof PlayerClash) {
      return { errors: { hours: "You already have a booking at that time." } };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { message: "Someone just booked one of those hours. Try again." };
    }
    throw error;
  }

  revalidateBookingSurfaces(court.hub.id);

  // The hours are held, not booked. Send the player straight to checkout —
  // the clock is already running.
  if (paymentId) redirect(`/dashboard/bookings/pay/${paymentId}`);

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

// NOTE: there is deliberately no player-facing cancel action. A player cannot
// cancel their own confirmed booking — the venue is holding the court for them,
// so releasing it is the venue's call. Removing the button alone wouldn't be
// enough: a Server Action is a public endpoint, so the capability is gone
// rather than hidden. The player is told to contact the venue instead.
//
// CancelledBy.PLAYER stays in the schema for the historical rows that already
// carry it.

export async function cancelHubBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to manage bookings." };
  if (viewer.role !== "PARTNER" && viewer.role !== "ADMIN") {
    return { message: "Only the hub owner can cancel this booking." };
  }
  if (viewer.role === "PARTNER" && viewer.partnerStatus !== "ACTIVE") {
    return { message: "Your partner account is waiting for admin verification." };
  }

  const parsed = PartnerCancelBookingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
    refund: String(formData.get("refund") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Admins can cancel anywhere; partners only within hubs they own.
  const booking = await prisma.booking.findFirst({
    where:
      viewer.role === "ADMIN"
        ? { id: parsed.data.id }
        : { id: parsed.data.id, hub: { ownerId: viewer.id } },
    select: {
      id: true,
      hubId: true,
      status: true,
      endsAt: true,
      holdExpiresAt: true,
      bookingPaymentId: true,
      bookingPayment: { select: { status: true } },
    },
  });
  if (!booking) return { message: "Booking not found." };

  // A live hold can be cancelled too — that just releases the hours, and the
  // player's payment (if any) never settles. A lapsed one is already gone.
  const live =
    booking.status === "CONFIRMED" ||
    (booking.status === "PENDING" &&
      booking.holdExpiresAt != null &&
      booking.holdExpiresAt > new Date());
  if (!live) {
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

  const wasPaid = booking.bookingPayment?.status === "SUCCEEDED";
  if (!wasPaid || parsed.data.refund !== "full") {
    return { success: "Booking cancelled and the player notified." };
  }

  // Cancel FIRST, refund second. If the gateway is down, the court is still
  // released — the alternative leaves it blocked by a booking nobody wants.
  const refund = await refundBookingPayment({
    paymentId: booking.bookingPaymentId!,
    reason: parsed.data.reason,
    refundedById: viewer.id,
  });
  if (!refund.ok) {
    return {
      success: `Booking cancelled, but the refund failed: ${refund.message} You can retry the refund from the booking.`,
    };
  }
  return { success: "Booking cancelled and its subtotal was refunded." };
}

// Refunding on its own — the retry when the refund leg of a cancellation
// failed, and the way a venue gives money back for a booking it's keeping.
export async function refundBookingAction(
  _prev: BookingFormState,
  formData: FormData
): Promise<BookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to manage bookings." };
  if (viewer.role !== "PARTNER" && viewer.role !== "ADMIN") {
    return { message: "Only the venue can refund this booking." };
  }
  if (viewer.role === "PARTNER" && viewer.partnerStatus !== "ACTIVE") {
    return { message: "Your partner account is waiting for admin verification." };
  }

  const parsed = RefundBookingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Ownership in the where clause, as everywhere else here.
  const booking = await prisma.booking.findFirst({
    where:
      viewer.role === "ADMIN"
        ? { id: parsed.data.id }
        : { id: parsed.data.id, hub: { ownerId: viewer.id } },
    select: { id: true, hubId: true, bookingPaymentId: true },
  });
  if (!booking) return { message: "Booking not found." };
  if (!booking.bookingPaymentId) {
    return { message: "That booking wasn't paid for online." };
  }

  const refund = await refundBookingPayment({
    paymentId: booking.bookingPaymentId,
    reason: parsed.data.reason,
    refundedById: viewer.id,
  });
  if (!refund.ok) return { message: refund.message };

  revalidateBookingSurfaces(booking.hubId);
  return {
    success: refund.alreadyRefunded
      ? "That payment was already refunded."
      : "The booking subtotal was refunded.",
  };
}

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
  if (viewer.role === "PARTNER" && viewer.partnerStatus !== "ACTIVE") {
    return { message: "Your partner account is waiting for admin verification." };
  }

  const parsed = RescheduleBookingSchema.safeParse({
    id: String(formData.get("id") ?? ""),
    courtId: String(formData.get("courtId") ?? ""),
    date: String(formData.get("date") ?? ""),
    hours: formData.getAll("hours").map((v) => String(v)),
    reason: String(formData.get("reason") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const { id, courtId, date, reason } = parsed.data;
  // A crafted post could repeat an hour; the count has to be of distinct ones.
  const hours = [...new Set(parsed.data.hours)].sort((a, b) => a - b);

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
      notes: true,
      rescheduleCount: true,
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

  // A move keeps the booking the same length. The player reserved this much
  // time, so the venue can neither hand some back nor bill them for time they
  // didn't ask for. Changing the length means cancelling and rebooking.
  const currentHours = booking.endHour - booking.startHour;
  if (hours.length !== currentHours) {
    return {
      errors: {
        hours: `Pick exactly ${currentHours} ${
          currentHours === 1 ? "hour" : "hours"
        } — a move keeps the booking the same length.`,
      },
    };
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
    courtHourlyRate: court.hourlyRate,
    scheduleRules: court.scheduleRules,
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

  // Hours needn't be contiguous. A Booking is one range, so a gapped
  // selection splits: the booking being moved takes the first run and each
  // remaining run becomes its own booking, all recording the same move.
  const runs = toRuns(hours);
  const [firstRun] = runs;

  if (
    runs.length === 1 &&
    courtId === booking.courtId &&
    date === booking.date &&
    firstRun.start === booking.startHour &&
    firstRun.end + 1 === booking.endHour
  ) {
    return { message: "Pick a different court, date or time." };
  }

  // Re-snapshot from the new court's current rate: the old snapshot may belong
  // to a different court entirely, and the length may have changed.
  const hoursFor = (run: { start: number; end: number }) =>
    Array.from({ length: runHours(run) }, (_, i) => run.start + i);
  const priceFor = (run: { start: number; end: number }) =>
    slotTotal(slots, hoursFor(run));
  const rateFor = (run: { start: number; end: number }) =>
    uniformSlotRate(slots, hoursFor(run));

  // Every booking that comes out of this move records the same origin, so the
  // player can see where each piece came from.
  const movedFrom = {
    prevCourtName: booking.court.name,
    prevDate: booking.date,
    prevStartHour: booking.startHour,
    prevEndHour: booking.endHour,
    prevTotalPrice: booking.totalPrice,
    rescheduledAt: new Date(),
    rescheduledBy: (viewer.role === "ADMIN" ? "ADMIN" : "PARTNER") as
      | "ADMIN"
      | "PARTNER",
    // null rather than undefined, so a second move without a reason clears
    // the previous one instead of leaving it attached to the new time.
    rescheduleReason: reason ?? null,
  };

  const slotRows = (bookingId: string, run: { start: number; end: number }) =>
    Array.from({ length: runHours(run) }, (_, i) => ({
      bookingId,
      courtId,
      date,
      hour: run.start + i,
    }));

  try {
    await prisma.$transaction(async (tx) => {
      await lockPlayerBookingHours(tx, booking.userId, date, hours);

      // The checks above ran outside the transaction; the player may have
      // cancelled since.
      const fresh = await tx.booking.findUnique({
        where: { id: booking.id },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "CONFIRMED") throw new StaleBooking();

      // Don't leave the PLAYER double-booked — excluding the booking being
      // moved, or it would always clash with itself and no move could succeed.
      for (const run of runs) {
        const clash = await tx.booking.findFirst({
          where: {
            userId: booking.userId,
            id: { not: booking.id },
            ...liveBookingWhere(),
            startsAt: { lt: manilaInstant(date, run.end + 1) },
            endsAt: { gt: manilaInstant(date, run.start) },
          },
          select: { id: true },
        });
        if (clash) throw new PlayerClash();
      }

      // 1. Free this booking's OWN hours first.
      //
      // This ordering is what makes an overlapping move possible: 6–8 PM ->
      // 7–9 PM reuses 7 PM, and the unique index would reject re-inserting a
      // key we still hold. It's safe because the delete is invisible outside
      // this transaction until commit — a concurrent booker aiming at 6 PM
      // blocks on our row lock, then succeeds if we commit (the hour really
      // was freed) or fails with P2002 if we roll back (it's still ours).
      await tx.bookingSlot.deleteMany({ where: { bookingId: booking.id } });

      // 2. The booking being moved takes the first run.
      await tx.booking.update({
        where: { id: booking.id, status: "CONFIRMED" },
        data: {
          courtId,
          date,
          startHour: firstRun.start,
          endHour: firstRun.end + 1,
          hours: runHours(firstRun),
          startsAt: manilaInstant(date, firstRun.start),
          endsAt: manilaInstant(date, firstRun.end + 1),
          hourlyRate: rateFor(firstRun),
          totalPrice: priceFor(firstRun),
          ...movedFrom,
          rescheduleCount: { increment: 1 },
        },
      });

      // 3. Claim the hours. The unique index is the guard: a concurrent
      //    transaction holding one of these keys makes this block, then fail
      //    with P2002 — which rolls back the delete above too, so the booking
      //    keeps its ORIGINAL hours and no split booking survives. Nothing
      //    partial can be left behind.
      //
      //    Deliberately NOT skipDuplicates: that would swallow the collision.
      await tx.bookingSlot.createMany({
        data: slotRows(booking.id, firstRun),
      });

      // 4. Each remaining run becomes its own booking, carrying the same
      //    origin so the player sees where every piece came from.
      for (const run of runs.slice(1)) {
        const split = await tx.booking.create({
          data: {
            courtId,
            hubId: booking.hubId,
            userId: booking.userId,
            date,
            startHour: run.start,
            endHour: run.end + 1,
            hours: runHours(run),
            startsAt: manilaInstant(date, run.start),
            endsAt: manilaInstant(date, run.end + 1),
            hourlyRate: rateFor(run),
            totalPrice: priceFor(run),
            notes: booking.notes,
            status: "CONFIRMED",
            ...movedFrom,
            rescheduleCount: booking.rescheduleCount + 1,
          },
          select: { id: true },
        });
        await tx.bookingSlot.createMany({ data: slotRows(split.id, run) });
      }
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
  return {
    success:
      runs.length === 1
        ? "Booking moved and the player notified."
        : `Booking moved into ${runs.length} sessions and the player notified.`,
  };
}
