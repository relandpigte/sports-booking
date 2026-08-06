"use server";

import { Prisma, type ManualPaymentNetwork } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { isImageDataUrl } from "@/lib/avatar";
import { settleBookingPayment, markBookingPaymentRefunded } from "@/lib/booking-payments";
import { prisma } from "@/lib/db";
import { getViewer, requireActivePartner } from "@/lib/dal";
import { isPartnerImpersonationActive } from "@/lib/impersonation";
import { manualNetworkPaymentMethod } from "@/lib/manual-payments";

const MAX_IMAGE_BYTES = 800 * 1024;
const NETWORKS = new Set<ManualPaymentNetwork>([
  "GCASH",
  "MAYA",
  "BANK_TRANSFER",
  "OTHER",
]);

export type ManualPaymentFormState = {
  errors?: Record<string, string>;
  message?: string;
  success?: string;
};

function value(formData: FormData, key: string, max = 200) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

function revalidatePayment(payment: {
  id: string;
  hubId: string;
  eventPublicId?: string | null;
}) {
  revalidatePath(`/dashboard/bookings/pay/${payment.id}`);
  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/hubs/${payment.hubId}/bookings`);
  revalidatePath(`/hubs/${payment.hubId}`);
  if (payment.eventPublicId) {
    revalidatePath(`/events/${payment.eventPublicId}`);
    revalidatePath(`/events/${payment.eventPublicId}/pay/${payment.id}`);
    revalidatePath(`/dashboard/events/${payment.eventPublicId}`);
    revalidatePath("/events");
  }
}

export async function savePartnerPaymentModeAction(
  _previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  if (await isPartnerImpersonationActive()) {
    return { message: "Payment settings are protected during assisted access." };
  }
  const partner = await requireActivePartner();
  const mode = value(formData, "mode", 20);
  if (mode !== "AUTOMATIC" && mode !== "MANUAL") {
    return { message: "Choose a valid payment mode." };
  }
  if (mode === "MANUAL") {
    const count = await prisma.partnerManualPaymentMethod.count({
      where: { partnerId: partner.id, active: true },
    });
    if (count === 0) {
      return { message: "Add and enable at least one manual payment method first." };
    }
  }
  await prisma.user.update({
    where: { id: partner.id },
    data: { partnerPaymentMode: mode },
  });
  revalidatePath("/dashboard/payments");
  revalidatePath("/hubs");
  revalidatePath("/events");
  return {
    success:
      mode === "MANUAL"
        ? "Manual payments are active for all new bookings and paid events."
        : "Automatic PayMongo payments are active for all new bookings and paid events.",
  };
}

export async function saveManualPaymentMethodAction(
  _previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  if (await isPartnerImpersonationActive()) {
    return { message: "Payment settings are protected during assisted access." };
  }
  const partner = await requireActivePartner();
  const id = value(formData, "id", 40);
  const network = value(formData, "network", 30) as ManualPaymentNetwork;
  const label = value(formData, "label", 80);
  const accountName = value(formData, "accountName", 120);
  const accountIdentifier = value(formData, "accountIdentifier", 160);
  const instructions = value(formData, "instructions", 1000);
  const qrImage = value(formData, "qrImage", 1_200_000);
  const active = formData.get("active") === "on";
  const errors: Record<string, string> = {};
  if (!NETWORKS.has(network)) errors.network = "Choose a valid network.";
  if (label.length < 2) errors.label = "Enter a payment-method label.";
  if (!accountIdentifier && !qrImage && !instructions) {
    errors.accountIdentifier = "Add account details, a QR code, or payment instructions.";
  }
  if (qrImage && !isImageDataUrl(qrImage, MAX_IMAGE_BYTES)) {
    errors.qrImage = "Upload a valid JPG, PNG, or WebP QR image under 800KB.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  if (id && !active) {
    const [account, otherActive] = await Promise.all([
      prisma.user.findUnique({
        where: { id: partner.id },
        select: { partnerPaymentMode: true },
      }),
      prisma.partnerManualPaymentMethod.count({
        where: { partnerId: partner.id, active: true, id: { not: id } },
      }),
    ]);
    if (account?.partnerPaymentMode === "MANUAL" && otherActive === 0) {
      return {
        message:
          "Switch to Automatic or enable another manual method before disabling this one.",
      };
    }
  }

  if (id) {
    const updated = await prisma.partnerManualPaymentMethod.updateMany({
      where: { id, partnerId: partner.id },
      data: {
        network,
        label,
        accountName: accountName || null,
        accountIdentifier: accountIdentifier || null,
        instructions: instructions || null,
        qrImage: qrImage || null,
        active,
      },
    });
    if (updated.count !== 1) return { message: "Payment method not found." };
  } else {
    const sortOrder = await prisma.partnerManualPaymentMethod.count({
      where: { partnerId: partner.id },
    });
    await prisma.partnerManualPaymentMethod.create({
      data: {
        partnerId: partner.id,
        network,
        label,
        accountName: accountName || null,
        accountIdentifier: accountIdentifier || null,
        instructions: instructions || null,
        qrImage: qrImage || null,
        active,
        sortOrder,
      },
    });
  }
  revalidatePath("/dashboard/payments");
  revalidatePath("/hubs");
  revalidatePath("/events");
  return { success: id ? "Payment method updated." : "Payment method added." };
}

export async function submitManualPaymentProofAction(
  _previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "PLAYER") {
    return { message: "Sign in with a player account to submit payment proof." };
  }
  const paymentId = value(formData, "paymentId", 40);
  const methodId = value(formData, "methodId", 40);
  const receiptImage = value(formData, "receiptImage", 1_200_000);
  const paymentReference = value(formData, "paymentReference", 120);
  const errors: Record<string, string> = {};
  if (!methodId) errors.methodId = "Choose a payment network.";
  if (!isImageDataUrl(receiptImage, MAX_IMAGE_BYTES)) {
    errors.receiptImage = "Upload a valid JPG, PNG, or WebP receipt under 800KB.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "BookingPayment" WHERE "id" = ${paymentId} FOR UPDATE`
    );
    const payment = await tx.bookingPayment.findFirst({
      where: {
        id: paymentId,
        userId: viewer.id,
        collectionMode: "MANUAL",
      },
      select: {
        id: true,
        partnerId: true,
        hubId: true,
        status: true,
        expiresAt: true,
        manualSubmittedAt: true,
        eventRegistration: {
          select: { event: { select: { publicId: true } } },
        },
        eventGuestSlots: {
          take: 1,
          select: {
            registration: { select: { event: { select: { publicId: true } } } },
          },
        },
      },
    });
    if (!payment) return { kind: "missing" as const };
    if (payment.status !== "PENDING") return { kind: "closed" as const };
    if (payment.manualSubmittedAt) {
      return { kind: "already" as const, payment };
    }
    if (payment.expiresAt <= now) return { kind: "expired" as const, payment };
    const method = await tx.partnerManualPaymentMethod.findFirst({
      where: { id: methodId, partnerId: payment.partnerId, active: true },
    });
    if (!method) return { kind: "method" as const, payment };

    await tx.bookingPayment.update({
      where: { id: payment.id },
      data: {
        method: manualNetworkPaymentMethod(method.network),
        manualPaymentMethodId: method.id,
        manualMethodLabel: method.label,
        manualAccountName: method.accountName,
        manualAccountDetails: method.accountIdentifier,
        manualInstructions: method.instructions,
        manualQrImage: method.qrImage,
        manualReceiptImage: receiptImage,
        manualPaymentRef: paymentReference || null,
        providerRef: paymentReference || null,
        manualSubmittedAt: now,
        failureCode: null,
        failureMessage: null,
      },
    });
    const bookings = await tx.booking.findMany({
      where: { bookingPaymentId: payment.id, status: "PENDING" },
      select: { id: true },
    });
    if (bookings.length > 0) {
      const ids = bookings.map((booking) => booking.id);
      await tx.booking.updateMany({
        where: { id: { in: ids }, status: "PENDING" },
        data: { holdExpiresAt: null },
      });
      await tx.bookingSlot.updateMany({
        where: { bookingId: { in: ids } },
        data: { holdExpiresAt: null },
      });
    }
    await tx.eventRegistration.updateMany({
      where: { bookingPaymentId: payment.id, status: "PENDING" },
      data: { holdExpiresAt: null },
    });
    await tx.eventGuestSlot.updateMany({
      where: { bookingPaymentId: payment.id, status: "PENDING" },
      data: { holdExpiresAt: null },
    });
    return { kind: "submitted" as const, payment };
  });

  if ("payment" in result && result.payment) {
    revalidatePayment({
      id: result.payment.id,
      hubId: result.payment.hubId,
      eventPublicId:
        result.payment.eventRegistration?.event.publicId ??
        result.payment.eventGuestSlots[0]?.registration.event.publicId,
    });
  }
  if (result.kind === "submitted" || result.kind === "already") {
    return { success: "Payment proof submitted. Your booking is pending venue review." };
  }
  if (result.kind === "expired") {
    return { message: "The 15-minute upload window expired and the slot was released." };
  }
  if (result.kind === "method") return { message: "That payment method is no longer available." };
  if (result.kind === "closed") return { message: "This payment is already closed." };
  return { message: "Payment not found." };
}

export async function reviewManualPaymentAction(
  _previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  const partner = await requireActivePartner();
  const paymentId = value(formData, "paymentId", 40);
  const decision = value(formData, "decision", 20);
  const note = value(formData, "note", 500);
  if (decision !== "approve" && decision !== "decline") {
    return { message: "Choose approve or decline." };
  }
  const payment = await prisma.bookingPayment.findFirst({
    where: {
      id: paymentId,
      partnerId: partner.id,
      collectionMode: "MANUAL",
      status: "PENDING",
      manualSubmittedAt: { not: null },
    },
    select: {
      id: true,
      hubId: true,
      eventRegistration: { select: { event: { select: { publicId: true } } } },
      eventGuestSlots: {
        take: 1,
        select: { registration: { select: { event: { select: { publicId: true } } } } },
      },
    },
  });
  if (!payment) return { message: "This proof was already reviewed or is unavailable." };

  if (decision === "approve") {
    const updated = await prisma.bookingPayment.updateMany({
      where: { id: payment.id, status: "PENDING", manualSubmittedAt: { not: null } },
      data: {
        status: "SUCCEEDED",
        paidAt: new Date(),
        manualReviewedAt: new Date(),
        manualReviewedById: partner.id,
        manualReviewNote: note || null,
      },
    });
    if (updated.count !== 1) return { message: "This proof was already reviewed." };
    const settled = await settleBookingPayment(payment.id);
    if (settled.status === "lost") {
      return { message: "The reserved capacity could not be confirmed. Review the payment manually." };
    }
  } else {
    await prisma.$transaction([
      prisma.bookingSlot.deleteMany({
        where: { booking: { bookingPaymentId: payment.id, status: "PENDING" } },
      }),
      prisma.booking.updateMany({
        where: { bookingPaymentId: payment.id, status: "PENDING" },
        data: { status: "EXPIRED", holdExpiresAt: null },
      }),
      prisma.eventRegistration.updateMany({
        where: { bookingPaymentId: payment.id, status: "PENDING" },
        data: { status: "EXPIRED", holdExpiresAt: null, cancelReason: note || null },
      }),
      prisma.eventGuestSlot.updateMany({
        where: { bookingPaymentId: payment.id, status: "PENDING" },
        data: { status: "EXPIRED", holdExpiresAt: null },
      }),
      prisma.bookingPayment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureCode: "manual_payment_declined",
          failureMessage: note || "The venue declined the submitted payment proof.",
          manualReviewedAt: new Date(),
          manualReviewedById: partner.id,
          manualReviewNote: note || null,
        },
      }),
    ]);
  }
  revalidatePayment({
    id: payment.id,
    hubId: payment.hubId,
    eventPublicId:
      payment.eventRegistration?.event.publicId ??
      payment.eventGuestSlots[0]?.registration.event.publicId,
  });
  return {
    success:
      decision === "approve"
        ? "Payment approved and the booking was confirmed."
        : "Payment declined and the reserved capacity was released.",
  };
}

export async function recordManualRefundAction(
  _previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  const partner = await requireActivePartner();
  const paymentId = value(formData, "paymentId", 40);
  const reference = value(formData, "reference", 120);
  const reason = value(formData, "reason", 500);
  const payment = await prisma.bookingPayment.findFirst({
    where: {
      id: paymentId,
      partnerId: partner.id,
      collectionMode: "MANUAL",
      status: "SUCCEEDED",
    },
    select: {
      id: true,
      hubId: true,
      venueAmount: true,
      eventRegistration: { select: { event: { select: { publicId: true } } } },
      eventGuestSlots: {
        take: 1,
        select: { registration: { select: { event: { select: { publicId: true } } } } },
      },
    },
  });
  if (!payment) return { message: "Manual payment not found or already refunded." };
  await markBookingPaymentRefunded({
    paymentId: payment.id,
    amount: Number(payment.venueAmount),
    refundRef: reference || null,
    reason: reason || "Manual refund recorded by the venue.",
    refundedById: partner.id,
  });
  revalidatePayment({
    id: payment.id,
    hubId: payment.hubId,
    eventPublicId:
      payment.eventRegistration?.event.publicId ??
      payment.eventGuestSlots[0]?.registration.event.publicId,
  });
  return { success: "Full manual refund recorded. No service fee was retained." };
}
