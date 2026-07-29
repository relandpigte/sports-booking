"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/dal";
import { firstErrors } from "@/lib/zod-errors";
import { PayBookingSchema } from "@/lib/validation";
import { chargeBookingPayment } from "@/lib/booking-payments";

// Starting a payment is now a single button: PayMongo hosts the form, so there
// is no method to choose here and no card detail to collect — which is why this
// file has no `values` echo and no CardSchema. Nothing sensitive passes
// through.
export type PayBookingFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  // Where PayMongo wants the payer to go. The client sends the browser there;
  // the hold keeps running while they're away.
  redirectUrl?: string;
};

export async function payForBookingAction(
  _prev: PayBookingFormState,
  formData: FormData
): Promise<PayBookingFormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to pay for your booking." };

  const parsed = PayBookingSchema.safeParse({
    paymentId: String(formData.get("paymentId") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  // Ownership is enforced inside, in the where clause.
  const outcome = await chargeBookingPayment({
    paymentId: parsed.data.paymentId,
    userId: viewer.id,
  });

  revalidatePath(`/dashboard/bookings/pay/${parsed.data.paymentId}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath("/dashboard");

  switch (outcome.status) {
    case "redirect":
      return { redirectUrl: outcome.url };
    case "confirmed":
      return { success: "Paid. Your court is confirmed." };
    case "pending":
      return {
        success:
          "Your payment is being processed. This page updates as soon as it clears.",
      };
    case "declined":
      return { message: outcome.message };
    case "expired":
      return {
        message:
          "This hold has expired and the hours have been released. Nothing was charged — please book again.",
      };
    case "in-flight":
      return { message: "That payment is already being processed." };
    case "already-paid":
      return { success: "This booking is already paid for." };
    default:
      return { message: "We couldn't find that payment." };
  }
}
