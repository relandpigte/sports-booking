import { transactionalEmailContent } from "@/lib/email-html";

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
      "Your player account is ready.",
      "Discover sports hubs across the Philippines, compare courts, and book the hours that suit your game.",
    ];
    const note =
      "You're receiving this because a Bunal.club player account was created for this email address.";

    return transactionalEmailContent({
      subject,
      preheader: "Your Bunal.club player account is ready. Find a court and start playing.",
      eyebrow: "Welcome to Bunal.club",
      heading: "You're ready to play",
      recipientName: input.name,
      paragraphs,
      actionLabel: "Find a court",
      actionUrl: input.actionUrl,
      note,
    });
  }

  const subject = "Welcome to Bunal.club — complete your venue profile";
  const paragraphs = [
    "Your partner account is ready.",
    "Sign in to add your owner and venue details. Your application enters the review queue only after you submit it.",
  ];
  const note =
    "You're receiving this because a Bunal.club partner account was created for this email address.";

  return transactionalEmailContent({
    subject,
    preheader: "Your Bunal.club partner account is ready for venue onboarding.",
    eyebrow: "Bunal.club for venues",
    heading: "Complete your venue profile",
    recipientName: input.name,
    paragraphs,
    actionLabel: "Continue venue setup",
    actionUrl: input.actionUrl,
    note,
  });
}
