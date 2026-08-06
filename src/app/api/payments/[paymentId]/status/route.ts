import { NextResponse } from "next/server";

import {
  getBookingPaymentStatus,
  pollBookingPayment,
} from "@/lib/booking-payments";
import { getCurrentUser } from "@/lib/dal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") {
    return NextResponse.json(
      { message: "Sign in with the player account that owns this payment." },
      { status: 401 }
    );
  }

  const { paymentId } = await params;
  let payment = await getBookingPaymentStatus(paymentId, user.id);
  if (!payment) {
    return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  }

  // Signed webhooks are authoritative, but an account-level delivery delay
  // must not leave an open payment screen stuck. Poll PayMongo only after the
  // ownership check and only while a claimed charge is unresolved.
  if (payment.status === "PENDING" && payment.chargeInFlight) {
    await pollBookingPayment(paymentId);
    payment = await getBookingPaymentStatus(paymentId, user.id);
    if (!payment) {
      return NextResponse.json(
        { message: "Payment not found." },
        { status: 404 }
      );
    }
  }

  return NextResponse.json(payment, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
