import { transactionalEmailHtml } from "@/lib/email-html";

export type WelcomeEmailContentInput =
  | {
      audience: "PLAYER";
      name: string;
      actionUrl: string;
    }
  | {
      audience: "PARTNER";
      name: string;
      venueName: string;
      actionUrl: string;
    };

export function welcomeEmailContent(input: WelcomeEmailContentInput): {
  subject: string;
  html: string;
  text: string;
} {
  if (input.audience === "PLAYER") {
    const subject = "Welcome to Bunal.club — let's play";
    const paragraphs = [
      `Hi ${input.name}, your player account is ready.`,
      "Discover sports hubs across Bohol, compare courts, and book the hours that suit your game.",
    ];
    const note =
      "You're receiving this because a Bunal.club player account was created for this email address.";

    return {
      subject,
      html: transactionalEmailHtml({
        eyebrow: "Welcome to Bunal.club",
        heading: "You're ready to play",
        paragraphs,
        actionLabel: "Find a court",
        actionUrl: input.actionUrl,
        note,
      }),
      text: [
        subject,
        "",
        ...paragraphs,
        "",
        `Find a court: ${input.actionUrl}`,
        "",
        note,
      ].join("\n"),
    };
  }

  const subject = "Welcome to Bunal.club — your venue application is in";
  const paragraphs = [
    `Hi ${input.name}, we've received the venue application for ${input.venueName}.`,
    "Our team will review the details you submitted. You can sign in now to view its status; venue management and payment tools unlock after approval.",
  ];
  const note =
    "You're receiving this because a Bunal.club partner account was created for this email address.";

  return {
    subject,
    html: transactionalEmailHtml({
      eyebrow: "Bunal.club for venues",
      heading: "Your application is under review",
      paragraphs,
      actionLabel: "View partner dashboard",
      actionUrl: input.actionUrl,
      note,
    }),
    text: [
      subject,
      "",
      ...paragraphs,
      "",
      `View partner dashboard: ${input.actionUrl}`,
      "",
      note,
    ].join("\n"),
  };
}
