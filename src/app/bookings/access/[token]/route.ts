import { NextResponse } from "next/server";

import {
  exchangeGuestAccessToken,
  guestBookingPath,
} from "@/lib/guest-bookings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const guestReservationId = await exchangeGuestAccessToken(token);
  if (!guestReservationId) {
    return NextResponse.redirect(new URL("/bookings/access-invalid", request.url));
  }
  return NextResponse.redirect(
    new URL(guestBookingPath(guestReservationId), request.url)
  );
}
