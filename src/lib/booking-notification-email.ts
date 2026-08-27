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
  paymentMode: "MANUAL" | "AUTOMATIC" | "NONE";
};

export type PlayerManualReceiptReceivedEmailContentInput = Omit<
  PlayerBookingConfirmedEmailContentInput,
  "paymentMode"
>;

export type PlayerBookingDeclinedEmailContentInput = Omit<
  PlayerBookingConfirmedEmailContentInput,
  "paymentMode"
> & {
  reason: string;
};

export type GuestEventAccessEmailContentInput = {
  playerName: string;
  venueName: string;
  eventTitle: string;
  schedule: string;
  status: "CONFIRMED" | "WAITLISTED" | "PENDING_AUTOMATIC" | "PENDING_MANUAL";
  actionUrl: string;
};

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
      : input.paymentMode === "AUTOMATIC"
        ? `Your payment was successful and your booking at ${input.venueName} is confirmed.`
        : `Your booking at ${input.venueName} is confirmed. No online payment was required.`;
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

export function guestEventAccessEmailContent(
  input: GuestEventAccessEmailContentInput
) {
  const statusCopy =
    input.status === "CONFIRMED"
      ? "Your event registration is confirmed."
      : input.status === "WAITLISTED"
        ? "You are on the event waitlist. No payment is required unless a spot becomes available."
        : input.status === "PENDING_MANUAL"
          ? "Your spots are being held while you complete the venue's manual payment instructions."
          : "Your spots are being held while you complete QR Ph payment.";
  const actionLabel =
    input.status === "CONFIRMED" || input.status === "WAITLISTED"
      ? "View event registration"
      : "Continue payment";

  return transactionalEmailContent({
    subject: `Your event registration — ${input.eventTitle}`,
    preheader: statusCopy,
    eyebrow: "Event registration",
    heading: statusCopy,
    recipientName: input.playerName,
    paragraphs: [
      `${input.eventTitle} at ${input.venueName}`,
      input.schedule,
      "Use the private link below to return to this registration without creating an account.",
    ],
    actionLabel,
    actionUrl: input.actionUrl,
    note:
      "Keep this private link secure. It provides access to your registration and payment status.",
  });
}

export function playerBookingDeclinedEmailContent(
  input: PlayerBookingDeclinedEmailContentInput
) {
  const subject = `Your booking was declined — ${input.venueName}`;
  const paragraphs = [
    `${input.venueName} declined the submitted manual payment for ${input.bookingTitle}.`,
    input.schedule,
    `Reason: ${input.reason}`,
    "The reserved court hours have been released and are available to other players.",
  ];

  return transactionalEmailContent({
    subject,
    preheader: `${input.venueName} declined the booking after reviewing the payment.`,
    eyebrow: "Booking declined",
    heading: "The booking was not confirmed",
    recipientName: input.playerName,
    paragraphs,
    actionLabel: "View booking status",
    actionUrl: input.actionUrl,
    note: "If you believe this was a mistake, contact the venue directly before making another transfer.",
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
