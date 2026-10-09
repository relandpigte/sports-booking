"use server";

import type { PayoutNetwork, PayoutRecipientKind } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin";
import { sanitizeImageDataUrl } from "@/lib/avatar";
import { getAuthenticatedUser, getViewer, requireRecentMfa } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendPayoutEmail } from "@/lib/email";
import { recordImpersonatedAction } from "@/lib/impersonation";
import { revalidatePartnerPaymentSurfaces } from "@/lib/payment-revalidation";
import {
  payoutEmailContent,
  type PayoutEmailContentInput,
} from "@/lib/payout-email";
import { getPayoutDetail, type PayoutDetail } from "@/lib/payouts";
import { consumeRateLimit } from "@/lib/rate-limit";
import { requirePartnerWorkspace } from "@/lib/staffing";
import { appUrl } from "@/lib/urls";
import { MarkPayoutPaidSchema, PayoutAccountSchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";

export type PayoutAccountFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  values?: Record<string, string>;
};

// What became of an email: delivered to the provider, never attempted (and
// why), or attempted and rejected.
export type PayoutEmailOutcome =
  | "sent"
  | "not-configured"
  | "undeliverable"
  | "failed";

export type MarkPayoutPaidState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  email?: PayoutEmailOutcome;
};

export type PayoutEmailPreviewState = {
  errors?: Record<string, string>;
  message?: string;
  preview?: {
    to: string;
    subject: string;
    html: string;
    // The inputs this preview was rendered from, so the form can tell when it
    // has gone stale.
    reference: string;
    recipientMessage: string;
  };
};

export type ResendPayoutEmailState = {
  message?: string;
  success?: string;
};

const NETWORK_LABEL: Record<PayoutNetwork, string> = {
  GCASH: "GCash",
  MAYA: "Maya",
  BANK_TRANSFER: "Bank transfer",
};

// Shows enough of a destination to recognise it without repeating the whole
// account number in an email.
function describeDestination(account: {
  network: PayoutNetwork;
  bankName: string | null;
  accountNumber: string;
}): string {
  const digits = account.accountNumber.replace(/\D/g, "");
  const label =
    account.network === "BANK_TRANSFER"
      ? (account.bankName ?? NETWORK_LABEL.BANK_TRANSFER)
      : NETWORK_LABEL[account.network];
  return `${label} account ending in ${digits.slice(-4)}`;
}

function formValues(formData: FormData): Record<string, string> {
  return {
    network: String(formData.get("network") ?? ""),
    bankName: String(formData.get("bankName") ?? ""),
    accountName: String(formData.get("accountName") ?? ""),
    accountNumber: String(formData.get("accountNumber") ?? ""),
  };
}

async function notify(
  input: Parameters<typeof sendPayoutEmail>[0]
): Promise<PayoutEmailOutcome> {
  if (!emailDeliveryConfigured()) return "not-configured";
  // example.com and the reserved .test TLD can never receive mail.
  if (input.to.endsWith("@example.com") || input.to.endsWith(".test")) {
    return "undeliverable";
  }
  try {
    await sendPayoutEmail(input);
    return "sent";
  } catch (error) {
    console.error(
      "Payout email failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
    return "failed";
  }
}

// The table form of a destination: who it went to, not just where.
function describeAccount(account: {
  network: PayoutNetwork;
  bankName: string | null;
  accountName: string;
  accountNumber: string;
}): string {
  const digits = account.accountNumber.replace(/\D/g, "");
  const label =
    account.network === "BANK_TRANSFER"
      ? (account.bankName ?? NETWORK_LABEL.BANK_TRANSFER)
      : NETWORK_LABEL[account.network];
  return `${label} · ${account.accountName} · •••• ${digits.slice(-4)}`;
}

function statementPathFor(recipientKind: PayoutRecipientKind): string {
  return recipientKind === "TRAINER"
    ? "/dashboard/trainer/payments"
    : "/dashboard/payments";
}

// The single place a "payout sent" email is assembled. Preview, send, and
// resend all come through here, so what the admin previews is what the
// recipient receives.
function payoutSentEmailInput(
  detail: PayoutDetail,
  input: { reference: string; message: string | null; paidAt: Date }
): Extract<PayoutEmailContentInput, { kind: "SENT" }> {
  return {
    kind: "SENT",
    recipientName: detail.recipientName,
    amount: detail.amount,
    paidAt: input.paidAt,
    destination: describeDestination(detail),
    account: describeAccount(detail),
    reference: input.reference,
    coversThrough: detail.coversThrough,
    earnings: detail.earnings,
    earningCount: detail.earningCount,
    refunds: detail.refunds,
    lines: detail.lines.map((line) => ({
      title: line.title,
      detail: line.detail,
      amount: line.amount,
    })),
    message: input.message,
    actionUrl: appUrl(statementPathFor(detail.recipientKind)),
  };
}

function emailOutcomeMessage(outcome: PayoutEmailOutcome, to: string): string {
  switch (outcome) {
    case "sent":
      return `The details were emailed to ${to}.`;
    case "not-configured":
      return "No email was sent: email delivery is not set up on this site.";
    case "undeliverable":
      return `No email was sent: ${to} cannot receive mail.`;
    case "failed":
      return `The email to ${to} could not be sent. Use Resend email to try again.`;
  }
}

// Writes the account and re-points any payout that has not been sent yet, in
// one transaction: a pending payout must never be transferred to an account
// its owner has just replaced.
async function savePayoutAccount(input: {
  userId: string;
  actorId: string;
  recipientKind: PayoutRecipientKind;
  statementPath: string;
  formData: FormData;
}): Promise<PayoutAccountFormState> {
  const values = formValues(input.formData);
  const parsed = PayoutAccountSchema.safeParse(values);
  if (!parsed.success) return { errors: firstErrors(parsed.error), values };

  // The form posts the stored QR straight back when it was not touched. Keep
  // that one byte for byte rather than re-encoding it, so an unrelated edit
  // is never mistaken for a new QR.
  const rawQrImage = String(input.formData.get("qrImage") ?? "")
    .trim()
    .slice(0, 1_200_000);
  let qrImage: string | null = null;
  if (rawQrImage) {
    const stored = await prisma.payoutAccount.findUnique({
      where: { userId: input.userId },
      select: { qrImage: true },
    });
    qrImage =
      stored?.qrImage === rawQrImage
        ? rawQrImage
        : await sanitizeImageDataUrl(rawQrImage, "qr");
    if (!qrImage) {
      return {
        errors: {
          qrImage: "Upload a valid JPG, PNG, or WebP QR image under 800KB.",
        },
        values,
      };
    }
  }

  // Changing where money goes is the highest-value edit on the account, so it
  // is throttled per recipient regardless of who is making it.
  if (
    !(await consumeRateLimit({
      namespace: "payout-account",
      subject: input.userId,
      limit: 5,
      windowSeconds: 60 * 60,
    }))
  ) {
    return {
      message: "Too many payout account changes. Try again in an hour.",
      values,
    };
  }

  const destination = {
    network: parsed.data.network,
    bankName:
      parsed.data.network === "BANK_TRANSFER"
        ? (parsed.data.bankName ?? null)
        : null,
    accountName: parsed.data.accountName,
    accountNumber: parsed.data.accountNumber.replace(/[ -]/g, ""),
  };

  const { changed, user } = await prisma.$transaction(async (tx) => {
    const previous = await tx.payoutAccount.findUnique({
      where: { userId: input.userId },
      select: {
        network: true,
        bankName: true,
        accountName: true,
        accountNumber: true,
        qrImage: true,
      },
    });
    await tx.payoutAccount.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        updatedById: input.actorId,
        ...destination,
        qrImage,
      },
      update: { updatedById: input.actorId, ...destination, qrImage },
    });
    await tx.payout.updateMany({
      where: {
        recipientId: input.userId,
        recipientKind: input.recipientKind,
        status: "PENDING",
      },
      data: destination,
    });
    const owner = await tx.user.findUnique({
      where: { id: input.userId },
      select: { name: true, email: true },
    });
    return {
      changed:
        previous != null &&
        (previous.network !== destination.network ||
          previous.bankName !== destination.bankName ||
          previous.accountName !== destination.accountName ||
          previous.accountNumber !== destination.accountNumber ||
          // The admin pays whatever the QR encodes, so a new or replaced QR
          // redirects money just as a new number does. Removing one cannot.
          (qrImage != null && previous.qrImage !== qrImage)),
      user: owner,
    };
  });

  // Only a CHANGE is a redirect-fraud signal. The first save is the owner
  // finishing setup and needs no alert.
  if (changed && user) {
    await notify({
      kind: "ACCOUNT_CHANGED",
      to: user.email,
      recipientName: user.name ?? "there",
      destination: describeDestination(destination),
      actionUrl: appUrl(input.statementPath),
      idempotencyKey: `payout-account-changed:${input.userId}:${Date.now()}`,
    });
  }

  return {
    success:
      "Payout account saved. Bunal.club sends payouts every Monday and Thursday.",
  };
}

export async function savePayoutAccountAction(
  _prev: PayoutAccountFormState,
  formData: FormData
): Promise<PayoutAccountFormState> {
  const workspace = await requirePartnerWorkspace("payments", "MANAGE");
  // Staff manage day-to-day payment settings, but only the owner — or an admin
  // assisting them — decides where the venue's money is sent.
  if (workspace.kind === "STAFF") {
    return {
      message: "Only the venue owner can change the payout account.",
      values: formValues(formData),
    };
  }
  await requireRecentMfa("/dashboard/payments");

  const result = await savePayoutAccount({
    userId: workspace.partnerId,
    actorId: workspace.actorId,
    recipientKind: "VENUE",
    statementPath: "/dashboard/payments",
    formData,
  });
  if (!result.success) return result;

  await recordImpersonatedAction({
    action: "PARTNER_PAYOUT_ACCOUNT_UPDATED",
    targetType: "User",
    targetId: workspace.partnerId,
    metadata: { network: String(formData.get("network") ?? "") },
  });
  await revalidatePartnerPaymentSurfaces(workspace.partnerId);
  return result;
}

export async function saveTrainerPayoutAccountAction(
  _prev: PayoutAccountFormState,
  formData: FormData
): Promise<PayoutAccountFormState> {
  const viewer = await getViewer();
  const actor = await getAuthenticatedUser();
  // A trainer is a capability on a PLAYER account. getViewer returns the
  // assisted partner during admin impersonation, which is never a trainer, so
  // requiring the two to match keeps this the trainer's own session.
  if (!viewer || !actor || viewer.id !== actor.id || viewer.role !== "PLAYER") {
    return { message: "Create a trainer profile first." };
  }
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: viewer.id },
    select: { id: true },
  });
  if (!profile) return { message: "Create a trainer profile first." };
  await requireRecentMfa("/dashboard/trainer/payments");

  const result = await savePayoutAccount({
    userId: viewer.id,
    actorId: viewer.id,
    recipientKind: "TRAINER",
    statementPath: "/dashboard/trainer/payments",
    formData,
  });
  if (!result.success) return result;

  revalidatePath("/dashboard/trainer");
  revalidatePath("/dashboard/trainer/payments");
  revalidatePath("/trainers");
  return result;
}

// Shows the admin the exact email a payout will send, before any money is
// recorded as moved. Reads only.
export async function previewPayoutEmailAction(
  _prev: PayoutEmailPreviewState,
  formData: FormData
): Promise<PayoutEmailPreviewState> {
  await requireAdmin();

  const parsed = MarkPayoutPaidSchema.safeParse({
    payoutId: String(formData.get("payoutId") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    note: String(formData.get("note") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const detail = await getPayoutDetail(parsed.data.payoutId);
  if (!detail || detail.status !== "PENDING") {
    return {
      message: "That payout was already recorded as paid, or no longer exists.",
    };
  }

  const content = payoutEmailContent(
    payoutSentEmailInput(detail, {
      reference: parsed.data.reference,
      message: parsed.data.message ?? null,
      paidAt: new Date(),
    })
  );
  return {
    preview: {
      to: detail.recipientEmail,
      subject: content.subject,
      html: content.html,
      reference: parsed.data.reference,
      recipientMessage: parsed.data.message ?? "",
    },
  };
}

// An admin confirms a manual transfer was made. The compare-and-set on PENDING
// is what makes a double submit, or two admins working the same list, record
// the payout once.
export async function markPayoutPaidAction(
  _prev: MarkPayoutPaidState,
  formData: FormData
): Promise<MarkPayoutPaidState> {
  const admin = await requireAdmin();
  await requireRecentMfa("/dashboard/admin/payouts");

  const parsed = MarkPayoutPaidSchema.safeParse({
    payoutId: String(formData.get("payoutId") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    note: String(formData.get("note") ?? ""),
    message: String(formData.get("message") ?? ""),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  if (
    !(await consumeRateLimit({
      namespace: "payout-mark-paid",
      subject: admin.id,
      limit: 200,
      windowSeconds: 60 * 60,
    }))
  ) {
    return { message: "Too many payouts recorded. Try again shortly." };
  }

  const paidAt = new Date();
  const payout = await prisma.$transaction(async (tx) => {
    const updated = await tx.payout.updateMany({
      where: { id: parsed.data.payoutId, status: "PENDING" },
      data: {
        status: "PAID",
        reference: parsed.data.reference,
        note: parsed.data.note ?? null,
        recipientMessage: parsed.data.message ?? null,
        paidAt,
        paidById: admin.id,
      },
    });
    if (updated.count !== 1) return null;

    const row = await tx.payout.findUnique({
      where: { id: parsed.data.payoutId },
      select: {
        id: true,
        recipientId: true,
        recipientKind: true,
        amount: true,
      },
    });
    if (!row) return null;
    await tx.securityEvent.create({
      data: {
        userId: admin.id,
        type: "ADMIN_PAYOUT_MARKED_PAID",
        metadata: {
          payoutId: row.id,
          recipientId: row.recipientId,
          recipientKind: row.recipientKind,
          amount: Number(row.amount),
          reference: parsed.data.reference,
        },
      },
    });
    return row;
  });
  if (!payout) {
    return {
      message: "That payout was already recorded as paid, or no longer exists.",
    };
  }

  // The transfer is recorded whatever happens to the email: the money has
  // already left, and a failed notification must not make that look undone.
  const email = await deliverPayoutSentEmail(payout.id, {
    reference: parsed.data.reference,
    message: parsed.data.message ?? null,
    paidAt,
    idempotencyKey: `payout-sent:${payout.id}`,
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/payouts");
  revalidatePath(statementPathFor(payout.recipientKind));
  return {
    success: `Payout recorded as paid. ${emailOutcomeMessage(email.outcome, email.to)}`,
    email: email.outcome,
  };
}

// Builds the email from the stored payout, sends it, and records a delivery.
async function deliverPayoutSentEmail(
  payoutId: string,
  input: {
    reference: string;
    message: string | null;
    paidAt: Date;
    idempotencyKey: string;
  }
): Promise<{ outcome: PayoutEmailOutcome; to: string }> {
  const detail = await getPayoutDetail(payoutId);
  if (!detail) return { outcome: "failed", to: "the recipient" };

  const outcome = await notify({
    ...payoutSentEmailInput(detail, input),
    to: detail.recipientEmail,
    idempotencyKey: input.idempotencyKey,
  });
  if (outcome === "sent") {
    await prisma.payout.update({
      where: { id: payoutId },
      data: { emailedAt: new Date() },
    });
  }
  return { outcome, to: detail.recipientEmail };
}

// Sends the payout email again, with the reference and message the payout was
// recorded with. For a delivery that failed, or a recipient who lost it.
export async function resendPayoutEmailAction(
  _prev: ResendPayoutEmailState,
  formData: FormData
): Promise<ResendPayoutEmailState> {
  const admin = await requireAdmin();
  await requireRecentMfa("/dashboard/admin/payouts");

  const payoutId = String(formData.get("payoutId") ?? "").trim();
  if (!payoutId || payoutId.length > 191) {
    return { message: "That payout no longer exists." };
  }
  if (
    !(await consumeRateLimit({
      namespace: "payout-email-resend",
      subject: admin.id,
      limit: 60,
      windowSeconds: 60 * 60,
    }))
  ) {
    return { message: "Too many emails resent. Try again shortly." };
  }

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    select: {
      status: true,
      reference: true,
      recipientMessage: true,
      paidAt: true,
    },
  });
  if (!payout || payout.status !== "PAID" || !payout.reference || !payout.paidAt) {
    return { message: "Only a payout recorded as paid can be emailed." };
  }

  const email = await deliverPayoutSentEmail(payoutId, {
    reference: payout.reference,
    message: payout.recipientMessage,
    paidAt: payout.paidAt,
    // A new key each time: the provider answers a repeated key with the
    // original result instead of sending again.
    idempotencyKey: `payout-sent:${payoutId}:resend:${Date.now()}`,
  });
  revalidatePath("/dashboard/admin/payouts");
  const text = emailOutcomeMessage(email.outcome, email.to);
  return email.outcome === "sent" ? { success: text } : { message: text };
}
