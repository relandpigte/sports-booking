import { transactionalEmailHtml } from "@/lib/email-html";

export function passwordResetEmailHtml(resetUrl: string): string {
  return transactionalEmailHtml({
    eyebrow: "Bunal.club account",
    heading: "Reset your password",
    paragraphs: [
      "Someone requested a password reset for your Bunal.club account. Use the secure link below to choose a new password.",
    ],
    actionLabel: "Reset password",
    actionUrl: resetUrl,
    note: "This link expires in 30 minutes and can only be used once. If you did not request this, you can safely ignore this email.",
  });
}
