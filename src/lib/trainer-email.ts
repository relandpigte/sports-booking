import "server-only";

import { transactionalEmailContent } from "@/lib/email-html";

export type TrainerLifecycleEmailInput = {
  recipientName: string;
  subject: string;
  heading: string;
  message: string;
  actionUrl: string;
  actionLabel: string;
};

export function trainerLifecycleEmailContent(input: TrainerLifecycleEmailInput) {
  return transactionalEmailContent({
    subject: input.subject,
    preheader: input.subject,
    eyebrow: "Trainer sessions",
    heading: input.heading,
    recipientName: input.recipientName,
    paragraphs: [input.message],
    actionLabel: input.actionLabel,
    actionUrl: input.actionUrl,
    note:
      "This is an operational trainer-session notification from Bunal.club. Sign in directly through Bunal.club if you need to review or update the session.",
  });
}
