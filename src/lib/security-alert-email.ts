import { transactionalEmailContent } from "@/lib/email-html";

export function newDeviceLoginEmailContent({
  name,
  device,
  location,
  occurredAt,
  securityUrl,
}: {
  name: string;
  device: string;
  location: string | null;
  occurredAt: Date;
  securityUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "New sign-in to your Bunal.club account";
  const when = occurredAt.toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
  const details = `${device}${location ? ` near ${location}` : ""} on ${when}`;
  const paragraphs = [
    "We noticed a sign-in from a device we haven't seen on your Bunal.club account before.",
    details,
  ];
  const note =
    "If this was you, no action is needed. If you don't recognize it, revoke the session and change your password immediately.";

  return transactionalEmailContent({
    subject,
    preheader: "A new device signed in to your Bunal.club account.",
    eyebrow: "Account security",
    heading: "New device sign-in",
    recipientName: name,
    paragraphs,
    actionLabel: "Review account security",
    actionUrl: securityUrl,
    note,
  });
}
