import { formatPHP } from "@/lib/currency";
import { transactionalEmailHtml } from "@/lib/email-html";

export type ServiceFeeOverdueEmailContentInput = {
  partnerName: string;
  accountType?: "PARTNER" | "TRAINER";
  overdueAmount: number;
  amountDue: number;
  dueAt: Date | null;
  enforcementAt: Date | null;
  blocked: boolean;
  actionUrl: string;
};

export function serviceFeeOverdueEmailContent(
  input: ServiceFeeOverdueEmailContentInput
): { subject: string; html: string; text: string } {
  const overdue = formatPHP(input.overdueAmount);
  const outstanding = formatPHP(input.amountDue);
  const dueDate = input.dueAt
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "long",
        timeZone: "Asia/Manila",
      }).format(input.dueAt)
    : null;
  const enforcementDate = input.enforcementAt
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "long",
        timeZone: "Asia/Manila",
      }).format(input.enforcementAt)
    : null;
  const subject = `Action required: ${overdue} service-fee balance is overdue`;
  const trainer = input.accountType === "TRAINER";
  const paragraphs = [
    `Hi ${input.partnerName}, your Bunal.club service-fee settlement has an overdue balance of ${overdue}.`,
    `Your total outstanding service-fee balance is ${outstanding}${dueDate ? `, and the oldest unpaid balance was due on ${dueDate}` : ""}.`,
    input.blocked
      ? trainer
        ? "New trainer-session requests and public trainer visibility are paused while this balance remains unpaid."
        : "New paid bookings and public venue visibility are paused while this balance remains unpaid."
      : trainer
        ? `Your trainer profile remains available during the three-day enforcement grace period${enforcementDate ? ` and will be paused on ${enforcementDate}` : ""} if payment is not completed.`
        : `Your hubs remain active during the three-day enforcement grace period${enforcementDate ? ` and will be paused on ${enforcementDate}` : ""} if payment is not completed.`,
    "Pay through QR Ph or submit your transfer reference and receipt from the Payments page. A manual transfer is credited only after admin approval.",
  ];
  const note =
    "Submitting valid payment proof starts admin review; only an approved settlement reduces the balance. Bunal.club will never ask for your password, PayMongo secret key, or authenticator code by email.";

  return {
    subject,
    html: transactionalEmailHtml({
      preheader: `${overdue} in service fees requires settlement.`,
      eyebrow: "Settlement overdue",
      heading: "Your service-fee balance needs attention",
      paragraphs,
      actionLabel: "Settle balance",
      actionUrl: input.actionUrl,
      note,
    }),
    text: [
      subject,
      "",
      ...paragraphs,
      "",
      `Settle balance: ${input.actionUrl}`,
      "",
      note,
    ].join("\n"),
  };
}
