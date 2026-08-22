import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/dal";
import { getTrainerPaymentStatus, pollTrainerPayment } from "@/lib/trainer-payment-actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLAYER") return NextResponse.json({ message: "Player account required." }, { status: 401 });
  const { paymentId } = await params;
  let payment = await getTrainerPaymentStatus(paymentId);
  if (!payment) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  if (payment.status === "PENDING" && payment.chargeInFlight) {
    await pollTrainerPayment(paymentId);
    payment = await getTrainerPaymentStatus(paymentId);
    if (!payment) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
  }
  return NextResponse.json(payment, { headers: { "Cache-Control": "private, no-store" } });
}
