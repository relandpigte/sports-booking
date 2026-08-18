import "server-only";

import { Resend } from "resend";

import { passwordResetEmailHtml } from "@/lib/password-reset-email";
import {
  partnerApprovalEmailContent,
  type PartnerApprovalEmailContentInput,
} from "@/lib/partner-approval-email";
import {
  partnerAssistanceEmailContent,
  type PartnerAssistanceEmailContentInput,
} from "@/lib/partner-assistance-email";
import {
  welcomeEmailContent,
  type WelcomeEmailContentInput,
} from "@/lib/welcome-email";
import { newDeviceLoginEmailContent } from "@/lib/security-alert-email";
import {
  partnerBookingNotificationEmailContent,
  playerBookingConfirmedEmailContent,
  playerManualReceiptReceivedEmailContent,
  type PartnerBookingNotificationEmailContentInput,
  type PlayerBookingConfirmedEmailContentInput,
  type PlayerManualReceiptReceivedEmailContentInput,
} from "@/lib/booking-notification-email";
import {
  serviceFeeOverdueEmailContent,
  type ServiceFeeOverdueEmailContentInput,
} from "@/lib/service-fee-notification-email";
import {
  staffInvitationEmailContent,
  type StaffInvitationEmailContentInput,
} from "@/lib/staff-invitation-email";

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  idempotencyKey: string;
};

type WelcomeEmailInput = WelcomeEmailContentInput & {
  to: string;
  idempotencyKey: string;
};

type PartnerApprovalEmailInput = PartnerApprovalEmailContentInput & {
  to: string;
  idempotencyKey: string;
};

type PartnerAssistanceEmailInput = PartnerAssistanceEmailContentInput & {
  to: string;
  idempotencyKey: string;
};

type NewDeviceLoginEmailInput = {
  to: string;
  name: string;
  device: string;
  location: string | null;
  occurredAt: Date;
  securityUrl: string;
  idempotencyKey: string;
};

type PartnerBookingNotificationEmailInput =
  PartnerBookingNotificationEmailContentInput & {
    to: string;
    idempotencyKey: string;
  };

type PlayerBookingConfirmedEmailInput =
  PlayerBookingConfirmedEmailContentInput & {
    to: string;
    idempotencyKey: string;
  };

type PlayerManualReceiptReceivedEmailInput =
  PlayerManualReceiptReceivedEmailContentInput & {
    to: string;
    idempotencyKey: string;
  };

type ServiceFeeOverdueEmailInput = ServiceFeeOverdueEmailContentInput & {
  to: string;
  idempotencyKey: string;
};

type StaffInvitationEmailInput = StaffInvitationEmailContentInput & {
  to: string;
  idempotencyKey: string;
};

type DeliverEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  category: string;
  description: string;
};

export function emailDeliveryConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()
  );
}

export function passwordResetEmailConfigured(): boolean {
  return emailDeliveryConfigured();
}

async function deliverEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey,
  category,
  description,
}: DeliverEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: [to],
      subject,
      html,
      text,
      tags: [{ name: "category", value: category }],
    },
    { idempotencyKey }
  );

  if (error) {
    throw new Error(`${description} failed: ${error.name}: ${error.message}`);
  }
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  idempotencyKey,
}: PasswordResetEmailInput): Promise<void> {
  await deliverEmail({
    to,
    subject: "Reset your Bunal.club password",
    html: passwordResetEmailHtml(resetUrl),
    text: [
      "Someone requested a password reset for your Bunal.club account.",
      "",
      `Reset your password: ${resetUrl}`,
      "",
      "This link expires in 30 minutes and can only be used once.",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    idempotencyKey,
    category: "password-reset",
    description: "Password-reset email delivery",
  });
}

export async function sendWelcomeEmail(
  input: WelcomeEmailInput
): Promise<void> {
  const content = welcomeEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category:
      input.audience === "PLAYER" ? "welcome-player" : "welcome-partner",
    description: "Welcome email delivery",
  });
}

export async function sendStaffInvitationEmail(
  input: StaffInvitationEmailInput
): Promise<void> {
  const content = staffInvitationEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "partner-staff-invitation",
    description: "Partner staff-invitation email delivery",
  });
}

export async function sendPartnerApprovalEmail(
  input: PartnerApprovalEmailInput
): Promise<void> {
  const content = partnerApprovalEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "partner-approved",
    description: "Partner-approval email delivery",
  });
}

export async function sendPartnerAssistanceEmail(
  input: PartnerAssistanceEmailInput
): Promise<void> {
  const content = partnerAssistanceEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "partner-assistance",
    description: "Partner-assistance email delivery",
  });
}

export async function sendNewDeviceLoginEmail(
  input: NewDeviceLoginEmailInput
): Promise<void> {
  const content = newDeviceLoginEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "security-new-device",
    description: "New-device security email delivery",
  });
}

export async function sendPartnerBookingNotificationEmail(
  input: PartnerBookingNotificationEmailInput
): Promise<void> {
  const content = partnerBookingNotificationEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category:
      input.kind === "COURT" ? "partner-court-booking" : "partner-event-booking",
    description: "Partner booking-notification email delivery",
  });
}

export async function sendPlayerBookingConfirmedEmail(
  input: PlayerBookingConfirmedEmailInput
): Promise<void> {
  const content = playerBookingConfirmedEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "player-booking-confirmed",
    description: "Player booking-confirmation email delivery",
  });
}

export async function sendPlayerManualReceiptReceivedEmail(
  input: PlayerManualReceiptReceivedEmailInput
): Promise<void> {
  const content = playerManualReceiptReceivedEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "player-manual-receipt-received",
    description: "Player manual-receipt email delivery",
  });
}

export async function sendServiceFeeOverdueEmail(
  input: ServiceFeeOverdueEmailInput
): Promise<void> {
  const content = serviceFeeOverdueEmailContent(input);
  await deliverEmail({
    to: input.to,
    subject: content.subject,
    html: content.html,
    text: content.text,
    idempotencyKey: input.idempotencyKey,
    category: "partner-service-fee-overdue",
    description: "Service-fee overdue email delivery",
  });
}
