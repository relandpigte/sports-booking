import { transactionalEmailHtml } from "@/lib/email-html";

export type StaffInvitationEmailContentInput = {
  partnerName: string;
  inviterName: string;
  permissions: string[];
  acceptUrl: string;
  expiresAt: Date;
};

export function staffInvitationEmailContent(
  input: StaffInvitationEmailContentInput
) {
  const expiry = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(input.expiresAt);
  const subject = `${input.inviterName} invited you to help manage ${input.partnerName}`;
  const paragraphs = [
    `${input.inviterName} invited you to join the ${input.partnerName} team on Bunal.club.`,
    `Your access: ${input.permissions.join(", ")}.`,
    `Accept by ${expiry}. You can use an existing player account or create one with this email address.`,
  ];
  const note =
    "Only accept invitations you recognize. The link is single-use and does not give access until you sign in with the invited email address.";

  return {
    subject,
    html: transactionalEmailHtml({
      preheader: `You were invited to the ${input.partnerName} team.`,
      eyebrow: "Team invitation",
      heading: `Join ${input.partnerName}`,
      paragraphs,
      actionLabel: "Accept invitation",
      actionUrl: input.acceptUrl,
      note,
    }),
    text: [
      subject,
      "",
      ...paragraphs,
      "",
      `Accept invitation: ${input.acceptUrl}`,
      "",
      note,
    ].join("\n"),
  };
}
