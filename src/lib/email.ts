import "server-only";

import { Resend } from "resend";

import { passwordResetEmailHtml } from "@/lib/password-reset-email";

type PasswordResetEmailInput = {
  to: string;
  resetUrl: string;
  idempotencyKey: string;
};

export function passwordResetEmailConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim()
  );
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
  idempotencyKey,
}: PasswordResetEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Password-reset email delivery is not configured");
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send(
    {
      from,
      to: [to],
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
    },
    { idempotencyKey }
  );

  if (error) {
    throw new Error(
      `Password-reset email failed: ${error.name}: ${error.message}`
    );
  }
}
