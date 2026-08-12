import { transactionalEmailHtml } from "@/lib/email-html";

export type PartnerAssistanceEmailContentInput = {
  name: string;
  adminName: string;
  expiresAt: Date;
  actionUrl: string;
};

export function partnerAssistanceEmailContent(
  input: PartnerAssistanceEmailContentInput
): { subject: string; html: string; text: string } {
  const subject = "An administrator is assisting with your Bunal.club setup";
  const expiry = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(input.expiresAt);
  const paragraphs = [
    `Hi ${input.name}, ${input.adminName} started a temporary assisted setup session for your partner workspace.`,
    `The session ends by ${expiry}. The administrator can manage venue details, courts, schedules, bookings, events, and reports on your behalf.`,
  ];
  const note =
    "The administrator can edit your workspace content and payment configuration. Your password, email, MFA, active sessions, and settlement payments remain protected. Every assisted change is audited. Contact Bunal.club immediately if you did not expect this assistance.";

  return {
    subject,
    html: transactionalEmailHtml({
      preheader: "A time-limited assisted setup session has started.",
      eyebrow: "Account assistance",
      heading: "We’re helping with your venue setup",
      paragraphs,
      actionLabel: "Review your partner dashboard",
      actionUrl: input.actionUrl,
      note,
    }),
    text: [
      subject,
      "",
      ...paragraphs,
      "",
      `Review your dashboard: ${input.actionUrl}`,
      "",
      note,
    ].join("\n"),
  };
}
