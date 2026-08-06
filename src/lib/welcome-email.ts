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
      "Discover sports hubs across the Philippines, compare courts, and book the hours that suit your game.",
    ];
    const note =
      "You're receiving this because a Bunal.club player account was created for this email address.";

    return {
      subject,
      html: transactionalEmailHtml({
        preheader: "Your Bunal.club player account is ready. Find a court and start playing.",
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

  const subject = "Welcome to Bunal.club — complete your venue profile";
  const paragraphs = [
    `Hi ${input.name}, your partner account is ready.`,
    "Sign in to add your owner and venue details. Your application enters the review queue only after you submit it.",
  ];
  const note =
    "You're receiving this because a Bunal.club partner account was created for this email address.";

  return {
    subject,
    html: transactionalEmailHtml({
      preheader: "Your Bunal.club partner account is ready for venue onboarding.",
      eyebrow: "Bunal.club for venues",
      heading: "Complete your venue profile",
      paragraphs,
      actionLabel: "Continue venue setup",
      actionUrl: input.actionUrl,
      note,
    }),
    text: [
      subject,
      "",
      ...paragraphs,
      "",
      `Continue venue setup: ${input.actionUrl}`,
      "",
      note,
    ].join("\n"),
  };
}
