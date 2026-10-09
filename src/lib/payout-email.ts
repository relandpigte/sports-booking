import "server-only";

import { formatPHP } from "@/lib/currency";
import { transactionalEmailContent } from "@/lib/email-html";
import { formatManilaDateLong, manilaDateOf } from "@/lib/time";

// One thing a payout paid for, or took back. `amount` is signed: a refund
// issued after an earlier payout arrives here as a negative line.
export type PayoutEmailLine = {
  title: string;
  detail: string | null;
  amount: number;
};

export type PayoutEmailContentInput =
  | {
      kind: "SENT";
      recipientName: string;
      amount: number;
      paidAt: Date;
      // Sentence form, "GCash account ending in 4567".
      destination: string;
      // Table form, "GCash · Juan Dela Cruz · •••• 4567".
      account: string;
      reference: string;
      // Manila civil date of the last day this payout covers.
      coversThrough: string;
      earnings: number;
      earningCount: number;
      // Zero, or the negative total of the refund lines.
      refunds: number;
      lines: PayoutEmailLine[];
      // Written by the admin for this recipient. Optional.
      message: string | null;
      actionUrl: string;
    }
  | {
      kind: "ACCOUNT_CHANGED";
      recipientName: string;
      destination: string;
      actionUrl: string;
    };

// Long statements are cut here so the message stays under the size at which
// mail clients clip it. The remainder is folded into one row, so the rows
// always add up to the amount sent.
export const PAYOUT_EMAIL_MAX_LINES = 100;

const signedPHP = (amount: number) =>
  amount < 0 ? `−${formatPHP(Math.abs(amount))}` : formatPHP(amount);

function payoutLineRows(lines: PayoutEmailLine[]) {
  const shown = lines.slice(0, PAYOUT_EMAIL_MAX_LINES);
  const rest = lines.slice(PAYOUT_EMAIL_MAX_LINES);
  const rows = shown.map((line) => ({
    title: line.title,
    detail: line.detail,
    amount: signedPHP(line.amount),
  }));
  if (rest.length > 0) {
    const remainder =
      Math.round(rest.reduce((sum, line) => sum + line.amount, 0) * 100) / 100;
    rows.push({
      title: `+ ${rest.length} more line${rest.length === 1 ? "" : "s"}`,
      detail: "Reply to Bunal.club support for the complete list",
      amount: signedPHP(remainder),
    });
  }
  return rows;
}

export function payoutEmailContent(input: PayoutEmailContentInput) {
  if (input.kind === "SENT") {
    const amount = formatPHP(input.amount);
    const sentOn = formatManilaDateLong(manilaDateOf(input.paidAt));
    const message = (input.message ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return transactionalEmailContent({
      subject: `Your ${amount} Bunal.club payout was sent`,
      preheader: `${amount} was transferred to ${input.destination}. Reference ${input.reference}.`,
      eyebrow: "Payout sent",
      heading: `${amount} is on its way`,
      recipientName: input.recipientName,
      paragraphs: [
        `Bunal.club transferred ${amount} to your ${input.destination} on ${sentOn}. Bank and e-wallet transfers can take a short while to appear.`,
        ...(message.length > 0
          ? ["A message from Bunal.club:", ...message]
          : []),
      ],
      details: [
        { label: "Amount sent", value: amount },
        { label: "Sent on", value: sentOn },
        { label: "Sent to", value: input.account },
        { label: "Transfer reference", value: input.reference },
        {
          label: "Covers payments up to",
          value: formatManilaDateLong(input.coversThrough),
        },
        {
          label: `Earned (${input.earningCount} payment${
            input.earningCount === 1 ? "" : "s"
          })`,
          value: formatPHP(input.earnings),
        },
        ...(input.refunds < 0
          ? [{ label: "Refunds deducted", value: signedPHP(input.refunds) }]
          : []),
      ],
      lineItems: {
        heading: "What this payout covers",
        rows: payoutLineRows(input.lines),
        totalLabel: "Total sent",
        totalAmount: amount,
      },
      actionLabel: "View payout statement",
      actionUrl: input.actionUrl,
      note:
        "Payouts are sent every Monday and Thursday. If this transfer does not arrive, reply to Bunal.club support with the reference above.",
    });
  }

  return transactionalEmailContent({
    subject: "Your Bunal.club payout account was changed",
    preheader: `Payouts will now be sent to ${input.destination}.`,
    eyebrow: "Security notice",
    heading: "Your payout account was updated",
    recipientName: input.recipientName,
    paragraphs: [
      `Future Bunal.club payouts, including any that are still pending, will be sent to ${input.destination}.`,
      "If you made this change, no action is needed.",
      "If you did not, sign in and correct the account immediately, then change your password.",
    ],
    actionLabel: "Review payout account",
    actionUrl: input.actionUrl,
    note:
      "Bunal.club will never ask for your password or authenticator code by email.",
  });
}
