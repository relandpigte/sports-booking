import "server-only";

import {
  emailDeliveryConfigured,
  sendPartnerBookingNotificationEmail,
  sendPlayerBookingConfirmedEmail,
  sendGuestEventAccessEmail,
  sendPlayerBookingDeclinedEmail,
  sendPlayerManualReceiptReceivedEmail,
} from "@/lib/email";
import { listOperationalRecipients } from "@/lib/operational-recipients";
import { appUrl } from "@/lib/urls";

export async function notifyPartnerOfBooking(input: {
  to: string;
  partnerName: string;
  playerName: string;
  kind: "COURT" | "EVENT";
  venueName: string;
  bookingTitle: string;
  schedule: string;
  status: string;
  spots?: number;
  actionPath: string;
  idempotencyKey: string;
}): Promise<void> {
  if (!emailDeliveryConfigured() || isReservedTestAddress(input.to)) return;

  try {
    await sendPartnerBookingNotificationEmail({
      ...input,
      actionUrl: appUrl(input.actionPath),
    });
  } catch (error) {
    // The reservation is the source of truth. Email delivery must never roll
    // back a booking or prevent the player from continuing to checkout.
    console.error(
      "Partner booking-notification email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

export async function notifyPartnerTeamOfBooking(input: {
  partnerId: string;
  module: "bookings" | "events";
  playerName: string;
  kind: "COURT" | "EVENT";
  venueName: string;
  bookingTitle: string;
  schedule: string;
  status: string;
  spots?: number;
  actionPath: string;
  idempotencyKey: string;
}): Promise<void> {
  const recipients = await listOperationalRecipients(
    input.partnerId,
    input.module
  );
  await Promise.all(
    recipients.map((recipient) =>
      notifyPartnerOfBooking({
        ...input,
        to: recipient.email,
        partnerName: recipient.name,
        idempotencyKey: `${input.idempotencyKey}-${recipient.key}`,
      })
    )
  );
}

export async function notifyPlayerBookingConfirmed(input: {
  to: string;
  playerName: string;
  venueName: string;
  bookingTitle: string;
  schedule: string;
  actionPath: string;
  idempotencyKey: string;
  paymentMode: "MANUAL" | "AUTOMATIC" | "NONE";
}): Promise<"sent" | "not-configured" | "skipped" | "failed"> {
  if (isReservedTestAddress(input.to)) return "skipped";
  if (!emailDeliveryConfigured()) {
    console.error(
      "Player booking-confirmation email delivery skipped: RESEND_API_KEY and EMAIL_FROM must be configured."
    );
    return "not-configured";
  }

  try {
    await sendPlayerBookingConfirmedEmail({
      ...input,
      actionUrl: appUrl(input.actionPath),
    });
    return "sent";
  } catch (error) {
    // Payment approval has already committed. A provider outage must not make
    // a confirmed booking appear to have failed.
    console.error(
      "Player booking-confirmation email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
    return "failed";
  }
}

export async function notifyGuestEventAccess(input: {
  to: string;
  playerName: string;
  venueName: string;
  eventTitle: string;
  schedule: string;
  status: "CONFIRMED" | "WAITLISTED" | "PENDING_AUTOMATIC" | "PENDING_MANUAL";
  actionPath: string;
  idempotencyKey: string;
}): Promise<"sent" | "not-configured" | "skipped" | "failed"> {
  if (isReservedTestAddress(input.to)) return "skipped";
  if (!emailDeliveryConfigured()) return "not-configured";
  try {
    await sendGuestEventAccessEmail({
      ...input,
      actionUrl: appUrl(input.actionPath),
    });
    return "sent";
  } catch (error) {
    console.error(
      "Guest event-access email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
    return "failed";
  }
}

export async function notifyPlayerBookingDeclined(input: {
  to: string;
  playerName: string;
  venueName: string;
  bookingTitle: string;
  schedule: string;
  reason: string;
  actionPath: string;
  idempotencyKey: string;
}): Promise<void> {
  if (!emailDeliveryConfigured() || isReservedTestAddress(input.to)) return;

  try {
    await sendPlayerBookingDeclinedEmail({
      ...input,
      actionUrl: appUrl(input.actionPath),
    });
  } catch (error) {
    console.error(
      "Player booking-decline email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

export async function notifyPlayerManualReceiptReceived(input: {
  to: string;
  playerName: string;
  venueName: string;
  bookingTitle: string;
  schedule: string;
  actionPath: string;
  idempotencyKey: string;
}): Promise<void> {
  if (!emailDeliveryConfigured() || isReservedTestAddress(input.to)) return;

  try {
    await sendPlayerManualReceiptReceivedEmail({
      ...input,
      actionUrl: appUrl(input.actionPath),
    });
  } catch (error) {
    // The receipt is already stored and the booking remains protected. Email
    // delivery cannot turn a successful proof submission into a failed one.
    console.error(
      "Player manual-receipt email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

function isReservedTestAddress(address: string) {
  return address.trim().toLocaleLowerCase("en-PH").endsWith(".test");
}
