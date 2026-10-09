import { transactionalEmailContent } from "@/lib/email-html";

export type PartnerApprovalEmailContentInput = {
  name: string;
  venueName: string;
  actionUrl: string;
};

export function partnerApprovalEmailContent(
  input: PartnerApprovalEmailContentInput
): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = "Your Bunal.club partner account is approved";
  const paragraphs = [
    `${input.venueName} has been verified and approved on Bunal.club.`,
    "You can now continue setup in your partner dashboard. Add your courts and operating hours, then add the GCash, Maya, or bank account where you want to receive your payouts. No PayMongo account is needed.",
  ];
  const note =
    "For your security, sign in directly through Bunal.club and never share your password or authenticator code by email.";

  return transactionalEmailContent({
    subject,
    preheader:
      "Your venue is approved. Continue setup to start accepting bookings.",
    eyebrow: "Bunal.club for venues",
    heading: "Your partner account is approved",
    recipientName: input.name,
    paragraphs,
    actionLabel: "Continue venue setup",
    actionUrl: input.actionUrl,
    note,
  });
}
