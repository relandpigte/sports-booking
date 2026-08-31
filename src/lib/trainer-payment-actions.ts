"use server";

import crypto from "node:crypto";

import { Prisma, type ManualPaymentNetwork } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { sanitizeImageDataUrl } from "@/lib/avatar";
import { CRYPTO_PURPOSE, encrypt, isEncryptionConfigured, secretHint } from "@/lib/crypto";
import { getViewer, requireRecentMfa } from "@/lib/dal";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { emailDeliveryConfigured, sendTrainerLifecycleEmail } from "@/lib/email";
import { appUrl } from "@/lib/urls";
import { loadTrainerGatewayCredentials } from "@/lib/trainer-gateway";
import { getVenueGateway } from "@/lib/payments/venue";
import { platformPaymongoConfigured } from "@/lib/payments/paymongo-platform";
import {
  PAYMONGO_WEBHOOK_VERSION,
  VENUE_WEBHOOK_EVENTS,
  registerPaymongoWebhook,
} from "@/lib/payments/paymongo-core";
import type { ProviderWebhookEvent } from "@/lib/payments/types";
import { consumeRateLimit } from "@/lib/rate-limit";
import { startTrainerServiceFeeCheckout } from "@/lib/trainer-service-fee-payments";
import { ConnectGatewaySchema } from "@/lib/validation";
import { firstErrors } from "@/lib/zod-errors";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";

export type TrainerPaymentState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
  qrImageUrl?: string;
  redirectUrl?: string;
};

const NETWORKS = new Set<ManualPaymentNetwork>([
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER",
]);

function value(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function revalidateTrainerPayments(paymentId?: string) {
  revalidatePath("/dashboard/trainer");
  revalidatePath("/dashboard/trainer/payments");
  revalidatePath("/dashboard/trainer/sessions");
  revalidatePath("/dashboard/bookings");
  if (paymentId) revalidatePath(`/dashboard/trainer-payments/${paymentId}`);
}

async function trainerOwner() {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return null;
  const profile = await prisma.trainerProfile.findUnique({
    where: { userId: viewer.id },
    select: { id: true, userId: true },
  });
  return profile ? { viewer, profile } : null;
}

async function sendLifecycle(input: Parameters<typeof sendTrainerLifecycleEmail>[0]) {
  if (!emailDeliveryConfigured() || input.to.endsWith("@example.com")) return;
  try {
    await sendTrainerLifecycleEmail(input);
  } catch (error) {
    console.error(
      "Trainer payment email failed:",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

async function ensureTrainerFeeEntries(
  tx: Prisma.TransactionClient,
  payment: {
    id: string;
    trainerId: string;
    platformFee: Prisma.Decimal;
    processingFee: Prisma.Decimal;
    processingFeeResponsibility: "PLAYER" | "BUNAL";
  }
) {
  await tx.trainerServiceFeeEntry.upsert({
    where: {
      trainerPaymentId_type: {
        trainerPaymentId: payment.id,
        type: "CHARGE",
      },
    },
    create: {
      trainerId: payment.trainerId,
      trainerPaymentId: payment.id,
      type: "CHARGE",
      amount: payment.platformFee,
    },
    update: {},
  });
  if (
    payment.processingFeeResponsibility === "BUNAL" &&
    Number(payment.processingFee) > 0
  ) {
    await tx.trainerServiceFeeEntry.upsert({
      where: {
        trainerPaymentId_type: {
          trainerPaymentId: payment.id,
          type: "PROCESSING_CREDIT",
        },
      },
      create: {
        trainerId: payment.trainerId,
        trainerPaymentId: payment.id,
        type: "PROCESSING_CREDIT",
        amount: payment.processingFee.negated(),
      },
      update: { amount: payment.processingFee.negated() },
    });
  }
}

export async function connectTrainerGatewayAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Create a trainer profile first." };
  await requireRecentMfa("/dashboard/trainer/payments");
  if (!isEncryptionConfigured()) return { message: "Payments are not configured on this server." };
  const parsed = ConnectGatewaySchema.safeParse({
    provider: value(formData, "provider", 30),
    publicKey: value(formData, "publicKey", 255),
    secretKey: value(formData, "secretKey", 255),
    webhookSecret: value(formData, "webhookSecret", 255),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };

  const existing = await prisma.trainerGateway.findUnique({
    where: { userId: owner.viewer.id },
    select: { webhookToken: true },
  });
  const webhookToken =
    existing?.webhookToken ?? crypto.randomBytes(24).toString("base64url");
  const credentials = {
    provider: "paymongo" as const,
    publicKey: parsed.data.publicKey,
    secretKey: parsed.data.secretKey,
    webhookSecret: parsed.data.webhookSecret ?? "",
  } as const;
  const verified = await getVenueGateway(credentials).verifyCredentials();
  if (!verified.ok) return { errors: { secretKey: verified.message } };
  const registered = await registerPaymongoWebhook(
    credentials.secretKey,
    appUrl(`/api/trainer-payments/webhook/${webhookToken}`),
    parsed.data.webhookSecret,
    VENUE_WEBHOOK_EVENTS
  );
  if (!registered.ok) return { message: registered.message };

  await prisma.trainerGateway.upsert({
    where: { userId: owner.viewer.id },
    create: {
      userId: owner.viewer.id,
      provider: credentials.provider,
      publicKey: credentials.publicKey,
      secretKeyEnc: encrypt(credentials.secretKey, CRYPTO_PURPOSE.gatewaySecretKey),
      webhookSecretEnc: encrypt(registered.secret, CRYPTO_PURPOSE.gatewayWebhookSecret),
      secretKeyHint: secretHint(credentials.secretKey),
      webhookToken,
      webhookVersion: PAYMONGO_WEBHOOK_VERSION,
      accountLabel: verified.accountLabel,
    },
    update: {
      provider: credentials.provider,
      publicKey: credentials.publicKey,
      secretKeyEnc: encrypt(credentials.secretKey, CRYPTO_PURPOSE.gatewaySecretKey),
      webhookSecretEnc: encrypt(registered.secret, CRYPTO_PURPOSE.gatewayWebhookSecret),
      secretKeyHint: secretHint(credentials.secretKey),
      webhookVersion: PAYMONGO_WEBHOOK_VERSION,
      accountLabel: verified.accountLabel,
      disconnectedAt: null,
    },
  });
  revalidateTrainerPayments();
  return { success: "PayMongo connected for trainer-session payments." };
}

export async function saveTrainerPaymentModeAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Create a trainer profile first." };
  const mode = value(formData, "mode", 20);
  if (mode !== "AUTOMATIC" && mode !== "MANUAL") return { message: "Choose a valid payment mode." };
  if (mode === "AUTOMATIC") {
    const ready = await prisma.trainerGateway.findFirst({
      where: { userId: owner.viewer.id, disconnectedAt: null },
      select: { id: true },
    });
    if (!ready) return { message: "Connect PayMongo before selecting Automatic." };
  } else {
    const count = await prisma.trainerManualPaymentMethod.count({
      where: { trainerId: owner.viewer.id, active: true },
    });
    if (count === 0) return { message: "Add an active manual payment method first." };
  }
  await prisma.trainerProfile.update({ where: { id: owner.profile.id }, data: { paymentMode: mode } });
  revalidateTrainerPayments();
  return { success: mode === "AUTOMATIC" ? "Automatic PayMongo payments selected." : "Manual transfer selected." };
}

export async function saveTrainerManualMethodAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Create a trainer profile first." };
  await requireRecentMfa("/dashboard/trainer/payments");
  const id = value(formData, "id", 50);
  const network = value(formData, "network", 30) as ManualPaymentNetwork;
  const label = value(formData, "label", 80);
  const accountName = value(formData, "accountName", 120);
  const accountIdentifier = value(formData, "accountIdentifier", 160);
  const instructions = value(formData, "instructions", 1000);
  const rawQrImage = value(formData, "qrImage", 1_200_000);
  const qrImage = rawQrImage ? await sanitizeImageDataUrl(rawQrImage, "qr") : null;
  const active = formData.get("active") === "on";
  const errors: Record<string, string> = {};
  if (!NETWORKS.has(network)) errors.network = "Choose a valid network.";
  if (label.length < 2) errors.label = "Enter a label.";
  if (!accountIdentifier && !instructions && !rawQrImage) errors.accountIdentifier = "Add account details, instructions, or a QR image.";
  if (rawQrImage && !qrImage) errors.qrImage = "Upload a valid QR image under 800KB.";
  if (Object.keys(errors).length) return { errors };

  if (id && !active) {
    const [profile, otherActiveMethods] = await Promise.all([
      prisma.trainerProfile.findUnique({
        where: { id: owner.profile.id },
        select: { paymentMode: true },
      }),
      prisma.trainerManualPaymentMethod.count({
        where: {
          trainerId: owner.viewer.id,
          active: true,
          id: { not: id },
        },
      }),
    ]);
    if (profile?.paymentMode === "MANUAL" && otherActiveMethods === 0) {
      return {
        message:
          "Switch to Automatic or enable another manual destination before disabling this one.",
      };
    }
  }

  if (id) {
    const updated = await prisma.trainerManualPaymentMethod.updateMany({
      where: { id, trainerId: owner.viewer.id },
      data: { network, label, accountName: accountName || null, accountIdentifier: accountIdentifier || null, instructions: instructions || null, qrImage, active },
    });
    if (updated.count !== 1) return { message: "Payment method not found." };
  } else {
    const sortOrder = await prisma.trainerManualPaymentMethod.count({ where: { trainerId: owner.viewer.id } });
    await prisma.trainerManualPaymentMethod.create({
      data: { trainerId: owner.viewer.id, network, label, accountName: accountName || null, accountIdentifier: accountIdentifier || null, instructions: instructions || null, qrImage, active, sortOrder },
    });
  }
  revalidateTrainerPayments();
  return { success: id ? "Payment method updated." : "Payment method added." };
}

export async function deleteTrainerManualMethodAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Create a trainer profile first." };
  await requireRecentMfa("/dashboard/trainer/payments");

  const id = value(formData, "id", 50);
  if (!id) return { message: "Choose a payment destination to delete." };

  const [method, profile, otherActiveMethods] = await Promise.all([
    prisma.trainerManualPaymentMethod.findFirst({
      where: { id, trainerId: owner.viewer.id },
      select: { id: true, active: true },
    }),
    prisma.trainerProfile.findUnique({
      where: { id: owner.profile.id },
      select: { paymentMode: true },
    }),
    prisma.trainerManualPaymentMethod.count({
      where: {
        trainerId: owner.viewer.id,
        active: true,
        id: { not: id },
      },
    }),
  ]);

  if (!method) return { message: "Payment destination not found." };
  if (
    method.active &&
    profile?.paymentMode === "MANUAL" &&
    otherActiveMethods === 0
  ) {
    return {
      message:
        "Switch to Automatic or enable another manual destination before deleting this one.",
    };
  }

  const deleted = await prisma.trainerManualPaymentMethod.deleteMany({
    where: { id, trainerId: owner.viewer.id },
  });
  if (deleted.count !== 1) {
    return { message: "Payment destination not found." };
  }

  revalidateTrainerPayments();
  return { success: "Payment destination deleted." };
}

async function confirmTrainerPayment(
  paymentId: string,
  providerRef?: string | null,
  manualReview?: {
    reviewedById: string;
    note: string | null;
  }
) {
  const now = new Date();
  const current = await prisma.trainerPayment.findUnique({
    where: { id: paymentId },
    include: { session: true },
  });
  if (
    current?.status === "PENDING" &&
    current.collectionMode === "AUTOMATIC" &&
    current.expiresAt <= now
  ) {
    const claimed = await prisma.trainerPayment.updateMany({
      where: { id: current.id, status: "PENDING", refundStartedAt: null },
      data: { refundStartedAt: now },
    });
    if (claimed.count === 1 && current.gatewayId && current.providerPaymentId) {
      const gateway = getVenueGateway(await loadTrainerGatewayCredentials(current.gatewayId));
      const refund = await gateway.refund(current.providerPaymentId, { amount: Number(current.amount), currency: "PHP" }, "Trainer-session payment completed after the hold expired.");
      if (refund.status !== "failed") {
        await prisma.$transaction([
          prisma.trainerPayment.update({ where: { id: current.id }, data: { status: "REFUNDED", refundedAt: now, refundedAmount: current.amount, refundRef: refund.refundId, refundReason: "Payment completed after the trainer-session hold expired." } }),
          prisma.trainerSession.update({ where: { id: current.trainerSessionId }, data: { status: "EXPIRED" } }),
          prisma.trainerSessionSlot.deleteMany({ where: { trainerSessionId: current.trainerSessionId } }),
        ]);
      } else {
        await prisma.trainerPayment.update({ where: { id: current.id }, data: { refundStartedAt: null, failureCode: "late_refund_failed", failureMessage: refund.message } });
      }
    }
    revalidateTrainerPayments(paymentId);
    return null;
  }
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.trainerPayment.findUnique({
      where: { id: paymentId },
      include: {
        session: true,
        trainer: { select: { email: true, name: true, playerName: true } },
        player: { select: { email: true, name: true, playerName: true } },
      },
    });
    if (!payment) return null;
    if (payment.status === "SUCCEEDED") {
      await ensureTrainerFeeEntries(tx, payment);
      return payment;
    }
    if (payment.status !== "PENDING") return null;
    if (!["AWAITING_PAYMENT", "PAYMENT_REVIEW"].includes(payment.session.status)) return null;
    await tx.trainerPayment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        paidAt: now,
        providerRef: providerRef ?? payment.providerRef,
        ...(manualReview
          ? {
              manualReviewedAt: payment.manualReviewedAt ?? now,
              manualReviewedById: manualReview.reviewedById,
              manualReviewNote: manualReview.note,
            }
          : {}),
      },
    });
    await tx.trainerSession.update({
      where: { id: payment.trainerSessionId },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    await ensureTrainerFeeEntries(tx, payment);
    await tx.chatConversation.upsert({
      where: { trainerSessionId: payment.trainerSessionId },
      create: { kind: "TRAINER_SESSION", trainerSessionId: payment.trainerSessionId },
      update: {},
    });
    return payment;
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });
  if (result) {
    const sessionLabel = `${formatManilaDateLong(result.session.date)}, ${formatSlotRange(result.session.startHour, result.session.endHour)}`;
    await Promise.all([
      sendLifecycle({
        to: result.player.email,
        recipientName: result.player.playerName ?? result.player.name ?? "Player",
        subject: "Trainer session confirmed",
        heading: "Your training session is confirmed",
        message: sessionLabel,
        actionUrl: appUrl("/dashboard/bookings"),
        actionLabel: "View booking",
        idempotencyKey: `trainer-paid-${result.id}-player`,
      }),
      sendLifecycle({
        to: result.trainer.email,
        recipientName: result.trainer.playerName ?? result.trainer.name ?? "Trainer",
        subject: "Trainer session paid",
        heading: "The player's payment is confirmed",
        message: sessionLabel,
        actionUrl: appUrl("/dashboard/trainer/sessions"),
        actionLabel: "View session",
        idempotencyKey: `trainer-paid-${result.id}-trainer`,
      }),
    ]);
  }
  revalidateTrainerPayments(paymentId);
  return result;
}

export async function payTrainerSessionAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Sign in as the player who requested this session." };
  const paymentId = value(formData, "paymentId", 60);
  const claimed = await prisma.trainerPayment.updateMany({
    where: { id: paymentId, playerId: viewer.id, status: "PENDING", collectionMode: "AUTOMATIC", expiresAt: { gt: new Date() }, chargeStartedAt: null },
    data: { chargeStartedAt: new Date(), attempt: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    const current = await prisma.trainerPayment.findFirst({ where: { id: paymentId, playerId: viewer.id }, select: { status: true, qrImageUrl: true } });
    if (current?.status === "SUCCEEDED") return { success: "This session is already paid." };
    if (current?.qrImageUrl) return { success: "Scan the QR Ph code to finish payment.", qrImageUrl: current.qrImageUrl };
    return { message: "This payment is unavailable or expired." };
  }
  const payment = await prisma.trainerPayment.findUnique({
    where: { id: paymentId },
    include: { session: true },
  });
  if (!payment?.gatewayId) return { message: "The trainer's gateway is unavailable." };
  const gateway = getVenueGateway(await loadTrainerGatewayCredentials(payment.gatewayId));
  const result = await gateway.charge({
    amount: { amount: Number(payment.amount), currency: "PHP" },
    description: `Trainer session — ${payment.session.date}, ${formatSlotRange(payment.session.startHour, payment.session.endHour)}`,
    idempotencyKey: `${payment.id}:${payment.attempt}`,
    expiresInSeconds: Math.max(60, Math.floor((payment.expiresAt.getTime() - Date.now()) / 1000)),
    metadata: { trainerPaymentId: payment.id, trainerSessionId: payment.session.id },
  });
  if (result.status === "succeeded") {
    await prisma.trainerPayment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: result.paymentId,
        ...(result.feeCentavos != null
          ? { processingFee: new Prisma.Decimal(result.feeCentavos / 100) }
          : {}),
        raw: result.raw as Prisma.InputJsonValue,
      },
    });
    const confirmed = await confirmTrainerPayment(payment.id, result.reference);
    return confirmed
      ? { success: "Paid. Your trainer session is confirmed." }
      : { message: "The payment finished after the hold expired, so a full refund was started." };
  }
  if (result.status === "requires_action") {
    await prisma.trainerPayment.update({
      where: { id: payment.id },
      data: { providerPaymentId: result.paymentId, providerClientKey: result.clientKey, redirectUrl: result.redirectUrl, qrImageUrl: result.qrImageUrl, raw: result.raw as Prisma.InputJsonValue },
    });
    revalidateTrainerPayments(payment.id);
    return {
      success: "Scan the QR Ph code to finish payment.",
      qrImageUrl: result.qrImageUrl ?? undefined,
      redirectUrl: result.redirectUrl ?? undefined,
    };
  }
  if (result.status === "pending") {
    await prisma.trainerPayment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: result.paymentId,
        providerRef: result.reference,
        raw: result.raw as Prisma.InputJsonValue,
      },
    });
    revalidateTrainerPayments(payment.id);
    return { success: "Payment is processing. We will confirm the session when it clears." };
  }
  await prisma.trainerPayment.update({
    where: { id: payment.id },
    data: { chargeStartedAt: null, failureCode: result.code, failureMessage: result.message, raw: result.raw as Prisma.InputJsonValue },
  });
  return { message: result.message };
}

export async function submitTrainerManualProofAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return { message: "Player account required." };
  const paymentId = value(formData, "paymentId", 60);
  const paymentRef = value(formData, "paymentRef", 120);
  const rawReceipt = value(formData, "receiptImage", 1_200_000);
  const receiptImage = rawReceipt ? await sanitizeImageDataUrl(rawReceipt, "receipt") : null;
  if (!receiptImage) return { errors: { receiptImage: "Upload a valid receipt image under 800KB." } };
  const payment = await prisma.trainerPayment.findFirst({
    where: { id: paymentId, playerId: viewer.id, status: "PENDING", collectionMode: "MANUAL", expiresAt: { gt: new Date() }, manualSubmittedAt: null },
    include: { session: true, trainer: { select: { email: true, name: true, playerName: true } } },
  });
  if (!payment) return { message: "This manual payment window is closed." };
  const submitted = await prisma.$transaction(async (tx) => {
    const claimed = await tx.trainerPayment.updateMany({
      where: { id: payment.id, status: "PENDING", manualSubmittedAt: null },
      data: { manualReceiptImage: receiptImage, manualPaymentRef: paymentRef || null, manualSubmittedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.trainerSession.update({ where: { id: payment.trainerSessionId }, data: { status: "PAYMENT_REVIEW" } });
    return true;
  });
  if (!submitted) return { message: "Payment proof was already submitted." };
  await sendLifecycle({
    to: payment.trainer.email,
    recipientName: payment.trainer.playerName ?? payment.trainer.name ?? "Trainer",
    subject: "Trainer payment proof submitted",
    heading: "Review the player's payment proof",
    message: "The requested hours remain reserved while you review the receipt.",
    actionUrl: appUrl("/dashboard/trainer/sessions"),
    actionLabel: "Review payment",
    idempotencyKey: `trainer-manual-proof-${payment.id}`,
  });
  revalidateTrainerPayments(payment.id);
  return { success: "Receipt submitted for trainer review." };
}

export async function reviewTrainerManualPaymentAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Trainer account required." };
  const paymentId = value(formData, "paymentId", 60);
  const decision = value(formData, "decision", 20);
  const note = value(formData, "note", 1000);
  const payment = await prisma.trainerPayment.findFirst({
    where: { id: paymentId, trainerId: owner.viewer.id, status: "PENDING", collectionMode: "MANUAL", manualSubmittedAt: { not: null } },
    include: { player: { select: { email: true, name: true, playerName: true } } },
  });
  if (!payment) return { message: "Payment proof is no longer awaiting review." };
  if (decision === "APPROVE") {
    let confirmed;
    try {
      confirmed = await confirmTrainerPayment(
        payment.id,
        payment.manualPaymentRef,
        {
          reviewedById: owner.viewer.id,
          note: note || null,
        }
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2028"
      ) {
        return {
          message:
            "Confirmation took too long. No confirmation changes were committed; please try approving again.",
        };
      }
      throw error;
    }
    if (!confirmed) {
      return {
        message:
          "Payment could not be confirmed. Refresh the session and try again.",
      };
    }
    return { success: "Payment approved and the session confirmed." };
  }
  if (decision !== "DECLINE") return { message: "Choose Approve or Decline." };
  const declined = await prisma.$transaction(async (tx) => {
    const reviewed = await tx.trainerPayment.updateMany({ where: { id: payment.id, status: "PENDING", manualReviewedAt: null }, data: { status: "FAILED", manualReviewedAt: new Date(), manualReviewedById: owner.viewer.id, manualReviewNote: note || null, failureCode: "manual_declined", failureMessage: note || "Trainer declined the payment proof." } });
    if (reviewed.count !== 1) return false;
    await tx.trainerSession.update({ where: { id: payment.trainerSessionId }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "PARTNER", cancelReason: note || "Manual payment proof was declined." } });
    await tx.trainerSessionSlot.deleteMany({ where: { trainerSessionId: payment.trainerSessionId } });
    return true;
  });
  if (!declined) return { message: "Payment proof was already reviewed." };
  await sendLifecycle({
    to: payment.player.email,
    recipientName: payment.player.playerName ?? payment.player.name ?? "Player",
    subject: "Trainer payment proof declined",
    heading: "The trainer could not verify your payment",
    message: note || "Contact the trainer if you believe this was a mistake.",
    actionUrl: appUrl("/dashboard/bookings"),
    actionLabel: "View booking",
    idempotencyKey: `trainer-manual-declined-${payment.id}`,
  });
  revalidateTrainerPayments(payment.id);
  return { success: "Payment declined and the hours released." };
}

export async function handleTrainerPaymentEvent(args: {
  gatewayId: string;
  webhookToken: string;
  event: ProviderWebhookEvent;
}) {
  const { event } = args;
  if (!event) return { handled: false };
  const endpoint = await prisma.trainerGateway.findFirst({
    where: { id: args.gatewayId, webhookToken: args.webhookToken },
    select: { id: true },
  });
  if (!endpoint) return { handled: false };
  const payment = await prisma.trainerPayment.findFirst({
    where: { gatewayId: args.gatewayId, providerPaymentId: event.providerPaymentId },
    select: { id: true, amount: true, status: true },
  });
  if (!payment) return { handled: false };
  if (event.type === "payment.succeeded") {
    const expected = Math.round(Number(payment.amount) * 100);
    if (event.amountCentavos != null && event.amountCentavos !== expected) {
      return { handled: false, reason: "amount_mismatch" };
    }
    if (event.feeCentavos != null) {
      await prisma.trainerPayment.update({
        where: { id: payment.id },
        data: { processingFee: new Prisma.Decimal(event.feeCentavos / 100) },
      });
    }
    await confirmTrainerPayment(payment.id, event.reference);
    return { handled: true };
  }
  if (event.type === "payment.failed" && payment.status === "PENDING") {
    await prisma.trainerPayment.update({ where: { id: payment.id }, data: { failureCode: event.failureCode, failureMessage: event.failureMessage, chargeStartedAt: null, raw: event.raw as Prisma.InputJsonValue } });
    return { handled: true };
  }
  return { handled: false };
}

export async function getTrainerPaymentStatus(paymentId: string) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return null;
  const payment = await prisma.trainerPayment.findFirst({
    where: { id: paymentId, playerId: viewer.id },
    select: { status: true, expiresAt: true, chargeStartedAt: true, providerPaymentId: true },
  });
  return payment ? {
    status: payment.status,
    secondsLeft: Math.max(0, Math.floor((payment.expiresAt.getTime() - Date.now()) / 1000)),
    chargeInFlight: payment.chargeStartedAt != null && payment.providerPaymentId != null,
  } : null;
}

export async function pollTrainerPayment(paymentId: string) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") return;
  const payment = await prisma.trainerPayment.findFirst({
    where: { id: paymentId, playerId: viewer.id },
    select: { id: true, status: true, gatewayId: true, providerPaymentId: true },
  });
  if (!payment || payment.status !== "PENDING" || !payment.gatewayId || !payment.providerPaymentId) return;
  const gateway = getVenueGateway(await loadTrainerGatewayCredentials(payment.gatewayId));
  const result = await gateway.getCharge(payment.providerPaymentId);
  if (result.status === "succeeded") {
    await prisma.trainerPayment.update({
      where: { id: payment.id },
      data: {
        providerRef: result.reference,
        ...(result.feeCentavos != null
          ? { processingFee: new Prisma.Decimal(result.feeCentavos / 100) }
          : {}),
        raw: result.raw as Prisma.InputJsonValue,
      },
    });
    await confirmTrainerPayment(payment.id, result.reference);
  } else if (result.status === "failed") {
    await prisma.trainerPayment.update({ where: { id: payment.id }, data: { failureCode: result.code, failureMessage: result.message, chargeStartedAt: null, raw: result.raw as Prisma.InputJsonValue } });
  }
}

export async function refundTrainerSessionAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "Sign in to manage this session." };
  const sessionId = value(formData, "sessionId", 60);
  const reason = value(formData, "reason", 1000);
  if (reason.length < 3) return { errors: { reason: "Add a refund reason." } };
  const session = await prisma.trainerSession.findFirst({
    where: { id: sessionId, OR: [{ playerId: viewer.id }, { trainer: { userId: viewer.id } }] },
    include: {
      payment: true,
      trainer: { include: { user: { select: { id: true, email: true, name: true, playerName: true } } } },
      player: { select: { id: true, email: true, name: true, playerName: true } },
    },
  });
  if (!session?.payment || session.payment.status !== "SUCCEEDED") return { message: "No successful payment is available to refund." };
  const trainerInitiated = session.trainer.userId === viewer.id;
  const playerEligible = session.playerId === viewer.id && session.startsAt.getTime() - Date.now() >= 24 * 3_600_000;
  const playerRequested = session.payment.refundRequestedById === session.playerId;
  if (!trainerInitiated && !playerEligible) {
    await prisma.$transaction([
      prisma.trainerSession.update({ where: { id: session.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "PLAYER", cancelReason: reason } }),
      prisma.trainerSessionSlot.deleteMany({ where: { trainerSessionId: session.id } }),
    ]);
    await sendLifecycle({ to: session.trainer.user.email, recipientName: session.trainer.user.playerName ?? session.trainer.user.name ?? "Trainer", subject: "Player cancelled trainer session", heading: "The player cancelled inside 24 hours", message: `${reason} The payment is non-refundable under the trainer-session policy.`, actionUrl: appUrl("/dashboard/trainer/sessions"), actionLabel: "View session", idempotencyKey: `trainer-late-cancel-${session.id}` });
    revalidateTrainerPayments(session.payment.id);
    return { success: "Session cancelled. Cancellations inside 24 hours are non-refundable." };
  }
  if (!trainerInitiated && session.payment.collectionMode === "MANUAL") {
    await prisma.$transaction([
      prisma.trainerPayment.update({ where: { id: session.payment.id }, data: { refundRequestedAt: new Date(), refundRequestedById: viewer.id, refundReason: reason } }),
      prisma.trainerSession.update({ where: { id: session.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: "PLAYER", cancelReason: reason } }),
      prisma.trainerSessionSlot.deleteMany({ where: { trainerSessionId: session.id } }),
    ]);
    await sendLifecycle({ to: session.trainer.user.email, recipientName: session.trainer.user.playerName ?? session.trainer.user.name ?? "Trainer", subject: "Manual trainer refund required", heading: "Return the player's trainer subtotal", message: `The player cancelled at least 24 hours ahead. Return ₱${Number(session.payment.trainerAmount).toFixed(2)}, then record the refund from your session dashboard.`, actionUrl: appUrl("/dashboard/trainer/sessions"), actionLabel: "Review refund", idempotencyKey: `trainer-manual-refund-request-${session.id}` });
    revalidateTrainerPayments(session.payment.id);
    return { success: "Session cancelled. The trainer was asked to return your eligible manual refund." };
  }
  const fullRefund = trainerInitiated && !playerRequested;
  const refundAmount = fullRefund ? Number(session.payment.amount) : Number(session.payment.trainerAmount);
  const claimed = await prisma.trainerPayment.updateMany({
    where: { id: session.payment.id, status: "SUCCEEDED", refundStartedAt: null },
    data: { refundStartedAt: new Date() },
  });
  if (claimed.count !== 1) return { message: "This refund is already processing." };
  let refundRef = `manual:${Date.now()}`;
  if (session.payment.collectionMode === "AUTOMATIC") {
    if (!session.payment.gatewayId || !session.payment.providerPaymentId) {
      await prisma.trainerPayment.update({ where: { id: session.payment.id }, data: { refundStartedAt: null } });
      return { message: "Gateway payment reference is missing." };
    }
    const gateway = getVenueGateway(await loadTrainerGatewayCredentials(session.payment.gatewayId));
    const refund = await gateway.refund(session.payment.providerPaymentId, { amount: refundAmount, currency: "PHP" }, reason);
    if (refund.status === "failed") {
      await prisma.trainerPayment.update({ where: { id: session.payment.id }, data: { refundStartedAt: null } });
      return { message: refund.message };
    }
    refundRef = refund.refundId;
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.trainerPayment.update({
      where: { id: session.payment!.id },
      data: { status: "REFUNDED", refundedAt: now, refundedAmount: new Prisma.Decimal(refundAmount), refundRef, refundReason: reason, refundedById: viewer.id },
    });
    await tx.trainerSession.update({
      where: { id: session.id },
      data: { status: "REFUNDED", refundedAt: now, cancelledAt: now, cancelledBy: fullRefund ? "PARTNER" : "PLAYER", cancelReason: reason },
    });
    await tx.trainerSessionSlot.deleteMany({ where: { trainerSessionId: session.id } });
    if (fullRefund) {
      await tx.trainerServiceFeeEntry.upsert({
        where: { trainerPaymentId_type: { trainerPaymentId: session.payment!.id, type: "REFUND" } },
        create: { trainerId: session.trainer.userId, trainerPaymentId: session.payment!.id, type: "REFUND", amount: new Prisma.Decimal(-Number(session.payment!.platformFee)) },
        update: {},
      });
    }
  });
  const recipient = trainerInitiated ? session.player : session.trainer.user;
  await sendLifecycle({
    to: recipient.email,
    recipientName: recipient.playerName ?? recipient.name ?? "Bunal.club member",
    subject: "Trainer session refunded",
    heading: "Your trainer-session refund was recorded",
    message: `Refund amount: ₱${refundAmount.toFixed(2)}. ${reason}`,
    actionUrl: appUrl(trainerInitiated ? "/dashboard/bookings" : "/dashboard/trainer/sessions"),
    actionLabel: "View session",
    idempotencyKey: `trainer-refunded-${session.id}`,
  });
  revalidateTrainerPayments(session.payment.id);
  return { success: "Refund recorded and the session closed." };
}

export async function submitTrainerServiceFeeSettlementAction(
  _previous: TrainerPaymentState,
  formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Trainer account required." };
  const paymentReference = value(formData, "paymentReference", 120);
  const rawReceipt = value(formData, "receiptImage", 1_200_000);
  const receiptImage = rawReceipt ? await sanitizeImageDataUrl(rawReceipt, "receipt") : null;
  if (paymentReference.length < 3) return { errors: { paymentReference: "Enter the transfer reference." } };
  if (!receiptImage) return { errors: { receiptImage: "Upload a valid receipt image under 800KB." } };
  try {
    await prisma.$transaction(async (tx) => {
      const awaitingPaymongo = await tx.trainerServiceFeeSettlement.count({
        where: {
          trainerId: owner.viewer.id,
          status: "AWAITING_PAYMENT",
          provider: "paymongo",
        },
      });
      if (awaitingPaymongo > 0) throw new Error("PAYMONGO_ACTIVE");
      const pending = await tx.trainerServiceFeeSettlement.count({ where: { trainerId: owner.viewer.id, status: "SUBMITTED" } });
      if (pending > 0) throw new Error("SETTLEMENT_PENDING");
      const [entries, paid, firstEntry] = await Promise.all([
        tx.trainerServiceFeeEntry.aggregate({ where: { trainerId: owner.viewer.id }, _sum: { amount: true } }),
        tx.trainerServiceFeeSettlement.aggregate({ where: { trainerId: owner.viewer.id, status: "PAID" }, _sum: { amount: true } }),
        tx.trainerServiceFeeEntry.findFirst({ where: { trainerId: owner.viewer.id }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ]);
      const due = Math.round((Number(entries._sum.amount ?? 0) - Number(paid._sum.amount ?? 0)) * 100) / 100;
      if (due <= 0 || !firstEntry) throw new Error("NO_BALANCE");
      await tx.trainerServiceFeeSettlement.create({ data: { trainerId: owner.viewer.id, periodStart: firstEntry.createdAt, periodEnd: new Date(), amount: new Prisma.Decimal(due), paymentReference, receiptImage } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMONGO_ACTIVE") {
      return {
        message:
          "A PayMongo checkout is already active. Finish or let it expire before submitting a manual transfer.",
      };
    }
    if (error instanceof Error && error.message === "SETTLEMENT_PENDING") return { message: "A settlement is already under review." };
    if (error instanceof Error && error.message === "NO_BALANCE") return { message: "There is no service-fee balance to settle." };
    throw error;
  }
  revalidatePath("/dashboard/admin/settlements");
  revalidateTrainerPayments();
  return { success: "Settlement submitted for admin review." };
}

export async function startTrainerServiceFeeCheckoutAction(
  _previous: TrainerPaymentState,
  _formData: FormData
): Promise<TrainerPaymentState> {
  const owner = await trainerOwner();
  if (!owner) return { message: "Trainer account required." };
  await requireRecentMfa("/dashboard/trainer/payments");
  if (!(await platformPaymongoConfigured())) {
    return {
      message:
        "QR Ph settlement is not configured yet. Use the manual transfer option below.",
    };
  }
  if (
    !(await consumeRateLimit({
      namespace: "trainer-service-fee-checkout",
      subject: owner.viewer.id,
      limit: 10,
      windowSeconds: 60 * 60,
    }))
  ) {
    return { message: "Too many checkout attempts. Try again later." };
  }

  const result = await startTrainerServiceFeeCheckout({
    trainerId: owner.viewer.id,
    trainerName:
      owner.viewer.playerName ?? owner.viewer.name ?? owner.viewer.email,
  });
  revalidatePath("/dashboard/admin/settlements");
  revalidateTrainerPayments();

  switch (result.status) {
    case "redirect":
      return { redirectUrl: result.url };
    case "paid":
      return { success: "Payment received. Your balance is settled." };
    case "none":
      return { message: "There is no service-fee balance to settle." };
    case "pending":
      return {
        success:
          "Your QR Ph checkout is being prepared. Refresh and try again in a moment.",
      };
    case "under-review":
      return {
        message:
          "A manual settlement receipt is already under review. Wait for the admin decision before starting another payment.",
      };
    case "failed":
      return { message: result.message };
  }
}

export async function reviewTrainerServiceFeeSettlementAction(formData: FormData) {
  const admin = await requireAdmin();
  const settlementId = value(formData, "settlementId", 60);
  const decision = value(formData, "decision", 20);
  const note = value(formData, "note", 500);
  if (!settlementId || !["PAID", "REJECTED"].includes(decision)) return;
  await prisma.trainerServiceFeeSettlement.updateMany({
    where: { id: settlementId, status: "SUBMITTED" },
    data: { status: decision as "PAID" | "REJECTED", reviewedAt: new Date(), reviewedById: admin.id, reviewNote: note || null },
  });
  revalidatePath("/dashboard/admin/settlements");
  revalidatePath("/dashboard/trainer/payments");
}
