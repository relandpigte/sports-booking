"use server";

import { revalidatePath } from "next/cache";

import { chargeBookingPayment } from "@/lib/booking-payments";
import { getViewer } from "@/lib/dal";
import { prisma } from "@/lib/db";

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
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Sign in with a player account to pay." };
  }

  const paymentId = String(formData.get("paymentId") ?? "");
  const publicId = String(formData.get("publicId") ?? "");
  if (!paymentId || !publicId) return { message: "Registration not found." };

  const registration = await prisma.eventRegistration.findFirst({
    where: {
      bookingPaymentId: paymentId,
      userId: viewer.id,
      event: { publicId },
    },
    select: { id: true },
  });
  if (!registration) return { message: "Registration payment not found." };

  const outcome = await chargeBookingPayment({
    paymentId,
    userId: viewer.id,
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
