"use server";

import { revalidatePath } from "next/cache";

import { chargeBookingPayment } from "@/lib/booking-payments";
import { getViewer } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { getCurrentGuestReservationId } from "@/lib/guest-bookings";

export type PayEventFormState = {
  message?: string;
  success?: string;
  redirectUrl?: string;
  qrImageUrl?: string;
};

export async function payForEventAction(
  _previous: PayEventFormState,
  formData: FormData
): Promise<PayEventFormState> {
  const viewer = await getViewer();
  if (viewer && viewer.role !== "PLAYER") {
    return { message: "Only player accounts or registered guests can pay." };
  }
  const guestReservationId = viewer
    ? null
    : await getCurrentGuestReservationId();
  if (!viewer && !guestReservationId) {
    return { message: "Open your private event link to continue payment." };
  }

  const paymentId = String(formData.get("paymentId") ?? "");
  const publicId = String(formData.get("publicId") ?? "");
  if (!paymentId || !publicId) return { message: "Registration not found." };

  const payment = await prisma.bookingPayment.findFirst({
    where: {
      id: paymentId,
      ...(viewer
        ? { userId: viewer.id }
        : { guestReservationId: guestReservationId! }),
      OR: [
        { eventRegistration: { event: { publicId } } },
        {
          eventGuestSlots: {
            some: { registration: { event: { publicId } } },
          },
        },
      ],
    },
    select: { id: true },
  });
  if (!payment) return { message: "Registration payment not found." };

  const outcome = await chargeBookingPayment({
    paymentId,
    ...(viewer
      ? { userId: viewer.id }
      : { guestReservationId: guestReservationId! }),
  });

  revalidatePath(`/events/${publicId}`);
  revalidatePath(`/events/${publicId}/pay/${paymentId}`);
  revalidatePath("/events");
  revalidatePath("/dashboard/events");

  switch (outcome.status) {
    case "action":
      return {
        redirectUrl: outcome.redirectUrl ?? undefined,
        qrImageUrl: outcome.qrImageUrl ?? undefined,
      };
    case "confirmed":
      return { success: "Paid. Your event registration is confirmed." };
    case "pending":
      return { success: "Your payment is still processing." };
    case "declined":
      return { message: outcome.message };
    case "expired":
      return { message: "Your registration hold expired. Register again." };
    case "in-flight":
      return { message: "That payment is already being processed." };
    case "already-paid":
      return { success: "This registration is already paid." };
    default:
      return { message: "We could not find that registration payment." };
  }
}
