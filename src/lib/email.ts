import "server-only";

import { Resend } from "resend";

import { passwordResetEmailHtml } from "@/lib/password-reset-email";
import {
  partnerApprovalEmailContent,
  type PartnerApprovalEmailContentInput,
} from "@/lib/partner-approval-email";
import {
  welcomeEmailContent,
  type WelcomeEmailContentInput,
} from "@/lib/welcome-email";

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
