import {
  transactionalEmailContent,
  type TransactionalEmailContent,
} from "@/lib/email-html";

export function passwordResetEmailContent(
  resetUrl: string
): TransactionalEmailContent {
  return transactionalEmailContent({
    subject: "Reset your Bunal.club password",
    preheader: "Use this secure link to reset your Bunal.club password.",
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

export function passwordResetEmailHtml(resetUrl: string): string {
  return passwordResetEmailContent(resetUrl).html;
}
