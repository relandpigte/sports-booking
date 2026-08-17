import "server-only";

import {
  emailDeliveryConfigured,
  sendPartnerBookingNotificationEmail,
  sendPlayerBookingConfirmedEmail,
} from "@/lib/email";
import { appUrl } from "@/lib/urls";
import { listOperationalRecipients } from "@/lib/staffing";

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
}): Promise<void> {
  if (!emailDeliveryConfigured() || isReservedTestAddress(input.to)) return;

  try {
    await sendPlayerBookingConfirmedEmail({
      ...input,
      actionUrl: appUrl(input.actionPath),
    });
  } catch (error) {
    // Payment approval has already committed. A provider outage must not make
    // a confirmed booking appear to have failed.
    console.error(
      "Player booking-confirmation email delivery failed:",
      error instanceof Error ? error.message : "Unknown provider error"
    );
  }
}

function isReservedTestAddress(address: string) {
  return address.trim().toLocaleLowerCase("en-PH").endsWith(".test");
}
