import { formatPHP } from "@/lib/currency";
import { transactionalEmailHtml } from "@/lib/email-html";

export type ServiceFeeOverdueEmailContentInput = {
  partnerName: string;
  overdueAmount: number;
  amountDue: number;
  dueAt: Date | null;
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
  const subject = `Action required: ${overdue} service-fee balance is overdue`;
  const paragraphs = [
    `Hi ${input.partnerName}, your Bunal.club service-fee settlement has an overdue balance of ${overdue}.`,
    `Your total outstanding service-fee balance is ${outstanding}${dueDate ? `, and the oldest unpaid balance was due on ${dueDate}` : ""}.`,
    "New paid bookings and public venue visibility are paused while this balance remains overdue. Pay through QR Ph or submit your transfer reference and receipt from the Payments page.",
  ];
  const note =
    "Submitting valid payment proof covers the overdue amount while it is reviewed. Bunal.club will never ask for your password, PayMongo secret key, or authenticator code by email.";

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
