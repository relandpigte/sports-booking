import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { exchangeGuestAccessToken } from "@/lib/guest-bookings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const guestReservationId = await exchangeGuestAccessToken(token);
  if (!guestReservationId) {
    return NextResponse.redirect(new URL("/events/access-invalid", request.url));
  }

  const registration = await prisma.eventRegistration.findUnique({
    where: { guestReservationId },
    select: {
      status: true,
      bookingPaymentId: true,
      payment: { select: { status: true } },
      event: { select: { publicId: true } },
    },
  });
  if (!registration) {
    return NextResponse.redirect(new URL("/events/access-invalid", request.url));
  }

  const eventPath = `/events/${encodeURIComponent(
    registration.event.publicId
  )}`;
  const continuePayment =
    registration.bookingPaymentId &&
    registration.payment?.status === "PENDING" &&
    registration.status !== "CONFIRMED";
  return NextResponse.redirect(
    new URL(
      continuePayment
        ? `${eventPath}/pay/${encodeURIComponent(
            registration.bookingPaymentId!
          )}`
        : eventPath,
      request.url
    )
  );
}
