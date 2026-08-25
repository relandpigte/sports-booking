import { NextResponse } from "next/server";

import {
  getGuestBookingPaymentStatus,
  pollBookingPayment,
} from "@/lib/booking-payments";
import { getGuestReservationAccess } from "@/lib/guest-bookings";

export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ guestReservationId: string; paymentId: string }>;
  }
) {
  const { guestReservationId, paymentId } = await params;
  if (!(await getGuestReservationAccess(guestReservationId))) {
    return NextResponse.json({ message: "Private access required." }, { status: 401 });
  }
  let payment = await getGuestBookingPaymentStatus(
    paymentId,
    guestReservationId
  );
  if (!payment) {
    return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  }
  if (payment.status === "PENDING" && payment.chargeInFlight) {
    await pollBookingPayment(paymentId);
    payment = await getGuestBookingPaymentStatus(paymentId, guestReservationId);
  }
  return NextResponse.json(payment, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
