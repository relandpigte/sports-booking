import { transactionalEmailContent } from "@/lib/email-html";

export type PartnerBookingNotificationEmailContentInput = {
  partnerName: string;
  playerName: string;
  kind: "COURT" | "EVENT";
  venueName: string;
  bookingTitle: string;
  schedule: string;
  status: string;
  spots?: number;
  actionUrl: string;
};

export type PlayerBookingConfirmedEmailContentInput = {
  playerName: string;
  venueName: string;
  bookingTitle: string;
  schedule: string;
  actionUrl: string;
  paymentMode: "MANUAL" | "AUTOMATIC";
};

export type PlayerManualReceiptReceivedEmailContentInput = Omit<
  PlayerBookingConfirmedEmailContentInput,
  "paymentMode"
>;

export function partnerBookingNotificationEmailContent(
  input: PartnerBookingNotificationEmailContentInput
) {
  const bookingKind = input.kind === "COURT" ? "court booking" : "event registration";
  const subject = `New ${bookingKind} at ${input.venueName}`;
  const spotCopy =
    input.kind === "EVENT" && input.spots
      ? ` This registration reserves ${input.spots} ${input.spots === 1 ? "spot" : "spots"}.`
      : "";
  const paragraphs = [
    `${input.playerName} submitted a new ${bookingKind} for ${input.bookingTitle}.`,
    `${input.schedule}.${spotCopy}`,
    `Current status: ${input.status}. Open your partner booking workspace to review the reservation and any submitted payment proof.`,
  ];
  const note =
    "This is an operational notification from Bunal.club. Verify manual transfers against the uploaded receipt before confirming them.";

  return transactionalEmailContent({
    subject,
    preheader: `${input.playerName} submitted a new ${bookingKind}.`,
    eyebrow: "New booking",
    heading: `A player booked ${input.bookingTitle}`,
    recipientName: input.partnerName,
    paragraphs,
    actionLabel: "Review booking",
    actionUrl: input.actionUrl,
    note,
  });
}

export function playerBookingConfirmedEmailContent(
  input: PlayerBookingConfirmedEmailContentInput
) {
  const subject = `Your booking is confirmed — ${input.venueName}`;
  const confirmationCopy =
    input.paymentMode === "MANUAL"
      ? `${input.venueName} approved your manual payment and confirmed your booking.`
      : `Your payment was successful and your booking at ${input.venueName} is confirmed.`;
  const paragraphs = [
    confirmationCopy,
    `${input.bookingTitle} · ${input.schedule}`,
    "Your booking now appears as confirmed in your Bunal.club schedule.",
  ];
  const note =
    "Keep your payment receipt and booking details for reference. Contact the venue directly if you need to request a change.";

  return transactionalEmailContent({
    subject,
    preheader: confirmationCopy,
    eyebrow: "Booking confirmed",
    heading: "You're confirmed",
    recipientName: input.playerName,
    paragraphs,
    actionLabel: "View booking",
    actionUrl: input.actionUrl,
    note,
  });
}

export function playerManualReceiptReceivedEmailContent(
  input: PlayerManualReceiptReceivedEmailContentInput
) {
  const subject = `Payment receipt received — ${input.venueName}`;
  const paragraphs = [
    `We received your manual payment receipt for ${input.bookingTitle}.`,
    input.schedule,
    `Your reserved spot remains protected while ${input.venueName} reviews the receipt. The booking is not final until the venue approves it.`,
  ];
  const note =
    "You do not need to upload the receipt again. We will update your booking after the venue approves or declines the payment.";

  return transactionalEmailContent({
    subject,
    preheader: `${input.venueName} is reviewing your payment receipt.`,
    eyebrow: "Receipt received",
    heading: "Your reservation is protected",
    recipientName: input.playerName,
    paragraphs,
    actionLabel: "View payment status",
    actionUrl: input.actionUrl,
    note,
  });
}
