"use server";

import { Prisma, type ManualPaymentNetwork } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { sanitizeImageDataUrl } from "@/lib/avatar";
import { settleBookingPayment, markBookingPaymentRefunded } from "@/lib/booking-payments";
import { prisma } from "@/lib/db";
import { getViewer, requireRecentMfa } from "@/lib/dal";
import { recordImpersonatedAction } from "@/lib/impersonation";
import { revalidatePartnerPaymentSurfaces } from "@/lib/payment-revalidation";
import {
  notifyPartnerTeamOfBooking,
  notifyPlayerBookingConfirmed,
  notifyPlayerManualReceiptReceived,
} from "@/lib/booking-notifications";
import { formatManilaDateLong, formatSlotRange } from "@/lib/time";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  getPartnerWorkspace,
  hasStaffAccess,
  recordPartnerActivity,
  requirePartnerWorkspace,
} from "@/lib/staffing";

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
  code?: "MANUAL_PAYMENT_PENDING_LIMIT" | "DUPLICATE_PAYMENT_REFERENCE";
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
  const workspace = await requirePartnerWorkspace("payments", "MANAGE");
  if (workspace.kind !== "STAFF") {
    await requireRecentMfa("/dashboard/payments");
  }
  const mode = value(formData, "mode", 20);
  if (mode !== "AUTOMATIC" && mode !== "MANUAL") {
    return { message: "Choose a valid payment mode." };
  }
  if (mode === "MANUAL") {
    const count = await prisma.partnerManualPaymentMethod.count({
      where: { partnerId: workspace.partnerId, active: true },
    });
    if (count === 0) {
      return { message: "Add and enable at least one manual payment method first." };
    }
  }
  await prisma.user.update({
    where: { id: workspace.partnerId },
    data: { partnerPaymentMode: mode },
  });
  await revalidatePartnerPaymentSurfaces(workspace.partnerId);
  await recordImpersonatedAction({
    action: "PARTNER_PAYMENT_MODE_UPDATED",
    targetType: "User",
    targetId: workspace.partnerId,
    metadata: { mode },
  });
  await recordPartnerActivity({
    workspace,
    action: "PARTNER_PAYMENT_MODE_UPDATED",
    targetType: "User",
    targetId: workspace.partnerId,
    metadata: { mode },
  });
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
  const workspace = await requirePartnerWorkspace("payments", "MANAGE");
  const partner = { id: workspace.partnerId };
  if (workspace.kind !== "STAFF") {
    await requireRecentMfa("/dashboard/payments");
  }
  const id = value(formData, "id", 40);
  const network = value(formData, "network", 30) as ManualPaymentNetwork;
  const label = value(formData, "label", 80);
  const accountName = value(formData, "accountName", 120);
  const accountIdentifier = value(formData, "accountIdentifier", 160);
  const instructions = value(formData, "instructions", 1000);
  const rawQrImage = value(formData, "qrImage", 1_200_000);
  const qrImage = rawQrImage
    ? await sanitizeImageDataUrl(rawQrImage, "qr")
    : null;
  const active = formData.get("active") === "on";
  let targetMethodId = id;
  const errors: Record<string, string> = {};
  if (!NETWORKS.has(network)) errors.network = "Choose a valid network.";
  if (label.length < 2) errors.label = "Enter a payment-method label.";
  if (!accountIdentifier && !rawQrImage && !instructions) {
    errors.accountIdentifier = "Add account details, a QR code, or payment instructions.";
  }
  if (rawQrImage && !qrImage) {
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
        qrImage,
        active,
      },
    });
    if (updated.count !== 1) return { message: "Payment method not found." };
  } else {
    const sortOrder = await prisma.partnerManualPaymentMethod.count({
      where: { partnerId: partner.id },
    });
    const created = await prisma.partnerManualPaymentMethod.create({
      data: {
        partnerId: partner.id,
        network,
        label,
        accountName: accountName || null,
        accountIdentifier: accountIdentifier || null,
        instructions: instructions || null,
        qrImage,
        active,
        sortOrder,
      },
      select: { id: true },
    });
    targetMethodId = created.id;
  }
  await revalidatePartnerPaymentSurfaces(partner.id);
  await recordImpersonatedAction({
    action: id
      ? "MANUAL_PAYMENT_METHOD_UPDATED"
      : "MANUAL_PAYMENT_METHOD_CREATED",
    targetType: "PartnerManualPaymentMethod",
    targetId: targetMethodId,
    metadata: { network, label, active },
  });
  await recordPartnerActivity({
    workspace,
    action: id
      ? "MANUAL_PAYMENT_METHOD_UPDATED"
      : "MANUAL_PAYMENT_METHOD_CREATED",
    targetType: "PartnerManualPaymentMethod",
    targetId: targetMethodId,
    metadata: { network, label, active },
  });
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
  if (!(await consumeRateLimit({
    namespace: "manual-proof",
    subject: viewer.id,
    limit: 10,
    windowSeconds: 60 * 60,
  }))) {
    return { message: "Too many payment-proof attempts. Try again later." };
  }
  const paymentId = value(formData, "paymentId", 40);
  const methodId = value(formData, "methodId", 40);
  const rawReceiptImage = value(formData, "receiptImage", 1_200_000);
  const receiptImage = await sanitizeImageDataUrl(rawReceiptImage, "receipt");
  const paymentReference = value(formData, "paymentReference", 120)
    .replace(/\s+/g, " ")
    .toUpperCase();
  const errors: Record<string, string> = {};
  if (!methodId) errors.methodId = "Choose a payment network.";
  if (!receiptImage) {
    errors.receiptImage = "Upload a valid JPG, PNG, or WebP receipt under 800KB.";
  }
  if (paymentReference && paymentReference.length < 4) {
    errors.paymentReference = "Enter the transfer reference shown by your payment app.";
  }
  if (Object.keys(errors).length > 0) return { errors };

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    // Lock the payment and venue together in one round trip. The venue lock
    // serializes duplicate-reference and one-pending-proof checks.
    const [payment] = await tx.$queryRaw<
      Array<{
        id: string;
        partnerId: string;
        hubId: string;
        status: string;
        expiresAt: Date;
        manualSubmittedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        payment."id",
        payment."partnerId",
        payment."hubId",
        payment."status"::text AS "status",
        payment."expiresAt",
        payment."manualSubmittedAt"
      FROM "BookingPayment" payment
      INNER JOIN "Hub" hub ON hub."id" = payment."hubId"
      WHERE payment."id" = ${paymentId}
        AND payment."userId" = ${viewer.id}
        AND payment."collectionMode" = 'MANUAL'::"PaymentCollectionMode"
      FOR UPDATE OF payment, hub
    `);
    if (!payment) return { kind: "missing" as const };
    if (payment.status !== "PENDING") return { kind: "closed" as const };
    if (payment.manualSubmittedAt) {
      return { kind: "already" as const, payment };
    }
    if (payment.expiresAt <= now) return { kind: "expired" as const, payment };

    // Perform validation, the proof claim, and every hold freeze as one SQL
    // statement. This avoids expiring an interactive transaction on a remote
    // database while preserving the locks acquired above.
    const [claim] = await tx.$queryRaw<
      Array<{
        methodAvailable: boolean;
        otherPendingProofs: number;
        duplicateReferences: number;
        submitted: boolean;
      }>
    >(Prisma.sql`
      WITH method AS MATERIALIZED (
        SELECT
          manual_method."id",
          manual_method."network",
          manual_method."label",
          manual_method."accountName",
          manual_method."accountIdentifier",
          manual_method."instructions",
          manual_method."qrImage"
        FROM "PartnerManualPaymentMethod" manual_method
        WHERE manual_method."id" = ${methodId}
          AND manual_method."partnerId" = ${payment.partnerId}
          AND manual_method."active" = TRUE
      ),
      facts AS MATERIALIZED (
        SELECT
          EXISTS(SELECT 1 FROM method) AS "methodAvailable",
          (
            SELECT COUNT(*)::int
            FROM "BookingPayment" other
            WHERE other."id" <> ${payment.id}
              AND other."userId" = ${viewer.id}
              AND other."hubId" = ${payment.hubId}
              AND other."collectionMode" = 'MANUAL'::"PaymentCollectionMode"
              AND other."status" = 'PENDING'::"PaymentStatus"
              AND other."manualSubmittedAt" IS NOT NULL
          ) AS "otherPendingProofs",
          CASE
            WHEN ${paymentReference} = '' THEN 0
            ELSE (
              SELECT COUNT(*)::int
              FROM "BookingPayment" other
              WHERE other."id" <> ${payment.id}
                AND other."hubId" = ${payment.hubId}
                AND other."collectionMode" = 'MANUAL'::"PaymentCollectionMode"
                AND other."manualPaymentRef" = ${paymentReference}
            )
          END AS "duplicateReferences"
      ),
      eligible AS MATERIALIZED (
        SELECT method.*
        FROM method
        CROSS JOIN facts
        WHERE facts."otherPendingProofs" = 0
          AND facts."duplicateReferences" = 0
      ),
      updated_payment AS (
        UPDATE "BookingPayment" payment
        SET
          "method" = eligible."network"::text::"PaymentMethodType",
          "manualPaymentMethodId" = eligible."id",
          "manualMethodLabel" = eligible."label",
          "manualAccountName" = eligible."accountName",
          "manualAccountDetails" = eligible."accountIdentifier",
          "manualInstructions" = eligible."instructions",
          "manualQrImage" = eligible."qrImage",
          "manualReceiptImage" = ${receiptImage},
          "manualPaymentRef" = NULLIF(${paymentReference}, ''),
          "providerRef" = NULLIF(${paymentReference}, ''),
          "manualSubmittedAt" = ${now},
          "failureCode" = NULL,
          "failureMessage" = NULL,
          "updatedAt" = ${now}
        FROM eligible
        WHERE payment."id" = ${payment.id}
          AND payment."status" = 'PENDING'::"PaymentStatus"
          AND payment."manualSubmittedAt" IS NULL
          AND payment."expiresAt" > ${now}
        RETURNING payment."id"
      ),
      updated_slots AS (
        UPDATE "BookingSlot" slot
        SET "holdExpiresAt" = NULL
        FROM "Booking" booking, updated_payment
        WHERE slot."bookingId" = booking."id"
          AND booking."bookingPaymentId" = updated_payment."id"
          AND booking."status" = 'PENDING'::"BookingStatus"
        RETURNING slot."id"
      ),
      updated_bookings AS (
        UPDATE "Booking" booking
        SET "holdExpiresAt" = NULL, "updatedAt" = ${now}
        FROM updated_payment
        WHERE booking."bookingPaymentId" = updated_payment."id"
          AND booking."status" = 'PENDING'::"BookingStatus"
        RETURNING booking."id"
      ),
      updated_registrations AS (
        UPDATE "EventRegistration" registration
        SET "holdExpiresAt" = NULL, "updatedAt" = ${now}
        FROM updated_payment
        WHERE registration."bookingPaymentId" = updated_payment."id"
          AND registration."status" = 'PENDING'::"EventRegistrationStatus"
        RETURNING registration."id"
      ),
      updated_guests AS (
        UPDATE "EventGuestSlot" guest
        SET "holdExpiresAt" = NULL, "updatedAt" = ${now}
        FROM updated_payment
        WHERE guest."bookingPaymentId" = updated_payment."id"
          AND guest."status" = 'PENDING'::"EventRegistrationStatus"
        RETURNING guest."id"
      )
      SELECT
        facts."methodAvailable",
        facts."otherPendingProofs",
        facts."duplicateReferences",
        EXISTS(SELECT 1 FROM updated_payment) AS "submitted",
        (SELECT COUNT(*) FROM updated_slots) AS "updatedSlotCount",
        (SELECT COUNT(*) FROM updated_bookings) AS "updatedBookingCount",
        (SELECT COUNT(*) FROM updated_registrations) AS "updatedRegistrationCount",
        (SELECT COUNT(*) FROM updated_guests) AS "updatedGuestCount"
      FROM facts
    `);
    if (claim.otherPendingProofs > 0) {
      return { kind: "pending-limit" as const, payment };
    }
    if (claim.duplicateReferences > 0) {
      return { kind: "duplicate-reference" as const, payment };
    }
    if (!claim.methodAvailable) return { kind: "method" as const, payment };
    if (!claim.submitted) return { kind: "closed" as const, payment };
    return { kind: "submitted" as const, payment };
  }, {
    maxWait: 10_000,
    timeout: 30_000,
  });

  if ("payment" in result && result.payment) {
    revalidatePayment({
      id: result.payment.id,
      hubId: result.payment.hubId,
    });
  }
  if (result.kind === "submitted" || result.kind === "already") {
    try {
      // Notification details are intentionally loaded after commit. Keeping
      // these relation reads outside the lock prevents a slow remote database
      // from expiring the proof-submission transaction.
      const payment = await prisma.bookingPayment.findUnique({
        where: { id: result.payment.id },
        select: {
          partner: { select: { id: true } },
          user: { select: { email: true, name: true, playerName: true } },
          bookings: {
            take: 1,
            orderBy: { startsAt: "asc" },
            select: {
              date: true,
              startHour: true,
              endHour: true,
              court: { select: { name: true } },
              hub: { select: { name: true } },
            },
          },
          eventRegistration: {
            select: {
              event: {
                select: {
                  publicId: true,
                  title: true,
                  date: true,
                  startHour: true,
                  endHour: true,
                  hub: { select: { name: true } },
                },
              },
            },
          },
          eventGuestSlots: {
            take: 1,
            select: {
              registration: {
                select: {
                  event: {
                    select: {
                      publicId: true,
                      title: true,
                      date: true,
                      startHour: true,
                      endHour: true,
                      hub: { select: { name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (payment) {
        const event =
          payment.eventRegistration?.event ??
          payment.eventGuestSlots[0]?.registration.event;
        const booking = payment.bookings[0];
        if (event) {
          revalidatePayment({
            id: result.payment.id,
            hubId: result.payment.hubId,
            eventPublicId: event.publicId,
          });
        }
        const playerName =
          payment.user.playerName ?? payment.user.name ?? "A player";
        const venueName =
          event?.hub.name ?? booking?.hub.name ?? "Your venue";
        const bookingTitle =
          event?.title ?? booking?.court.name ?? "Manual booking";
        const schedule = event
          ? `${formatManilaDateLong(event.date)} · ${formatSlotRange(
              event.startHour,
              event.endHour
            )}`
          : booking
            ? `${formatManilaDateLong(booking.date)} · ${formatSlotRange(
                booking.startHour,
                booking.endHour
              )}`
            : "See your Bunal.club schedule for details";
        await Promise.all([
          notifyPartnerTeamOfBooking({
            partnerId: payment.partner.id,
            module: event ? "events" : "bookings",
            playerName,
            kind: event ? "EVENT" : "COURT",
            venueName,
            bookingTitle,
            schedule,
            status: "Manual payment proof submitted — review required",
            actionPath: `/dashboard/bookings?q=${encodeURIComponent(result.payment.id)}`,
            idempotencyKey: `partner-manual-proof-submitted-${result.payment.id}`,
          }),
          notifyPlayerManualReceiptReceived({
            to: payment.user.email,
            playerName,
            venueName,
            bookingTitle,
            schedule,
            actionPath: event
              ? `/dashboard/bookings?q=${encodeURIComponent(event.publicId)}`
              : `/dashboard/bookings?q=${encodeURIComponent(result.payment.id)}`,
            idempotencyKey: `player-manual-receipt-received-${result.payment.id}`,
          }),
        ]);
      }
    } catch (error) {
      // The proof is already committed. A notification outage must not tell
      // the player that the receipt failed or encourage a duplicate upload.
      console.error(
        "Manual payment proof notification failed:",
        error instanceof Error ? error.message : "Unknown notification error"
      );
    }
  }
  if (result.kind === "submitted" || result.kind === "already") {
    return { success: "Payment proof submitted. Your booking is pending venue review." };
  }
  if (result.kind === "expired") {
    return { message: "The 15-minute upload window expired and the slot was released." };
  }
  if (result.kind === "pending-limit") {
    return {
      code: "MANUAL_PAYMENT_PENDING_LIMIT",
      message:
        "You already have a manual payment awaiting review at this venue. The venue must review it before you submit another.",
    };
  }
  if (result.kind === "duplicate-reference") {
    return {
      code: "DUPLICATE_PAYMENT_REFERENCE",
      message: "That transfer reference was already submitted for this venue.",
    };
  }
  if (result.kind === "method") return { message: "That payment method is no longer available." };
  if (result.kind === "closed") return { message: "This payment is already closed." };
  return { message: "Payment not found." };
}

export async function reviewManualPaymentAction(
  _previous: ManualPaymentFormState,
  formData: FormData
): Promise<ManualPaymentFormState> {
  const workspace = await getPartnerWorkspace();
  if (!workspace) return { message: "Partner workspace access is required." };
  if (workspace.kind !== "STAFF") {
    await requireRecentMfa("/dashboard/bookings");
  }
  const paymentId = value(formData, "paymentId", 40);
  const decision = value(formData, "decision", 20);
  const note = value(formData, "note", 500);
  if (decision !== "approve" && decision !== "decline") {
    return { message: "Choose approve or decline." };
  }
  const payment = await prisma.bookingPayment.findFirst({
    where: {
      id: paymentId,
      partnerId: workspace.partnerId,
      collectionMode: "MANUAL",
      status: "PENDING",
      manualSubmittedAt: { not: null },
    },
    select: {
      id: true,
      hubId: true,
      user: {
        select: { email: true, name: true, playerName: true },
      },
      bookings: {
        take: 1,
        orderBy: { startsAt: "asc" },
        select: {
          date: true,
          startHour: true,
          endHour: true,
          court: { select: { name: true } },
          hub: { select: { name: true } },
        },
      },
      eventRegistration: {
        select: {
          event: {
            select: {
              publicId: true,
              title: true,
              date: true,
              startHour: true,
              endHour: true,
              hub: { select: { name: true } },
            },
          },
        },
      },
      eventGuestSlots: {
        take: 1,
        select: {
          registration: {
            select: {
              event: {
                select: {
                  publicId: true,
                  title: true,
                  date: true,
                  startHour: true,
                  endHour: true,
                  hub: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!payment) return { message: "This proof was already reviewed or is unavailable." };
  const requiredModule =
    payment.eventRegistration || payment.eventGuestSlots.length > 0
      ? "events"
      : "bookings";
  if (!hasStaffAccess(workspace, requiredModule, "MANAGE")) {
    return { message: `Manage access to ${requiredModule} is required.` };
  }

  if (decision === "approve") {
    const updated = await prisma.bookingPayment.updateMany({
      where: { id: payment.id, status: "PENDING", manualSubmittedAt: { not: null } },
      data: {
        status: "SUCCEEDED",
        paidAt: new Date(),
        manualReviewedAt: new Date(),
        manualReviewedById: workspace.actorId,
        manualReviewNote: note || null,
      },
    });
    if (updated.count !== 1) return { message: "This proof was already reviewed." };
    const settled = await settleBookingPayment(payment.id);
    if (settled.status === "lost") {
      return { message: "The reserved capacity could not be confirmed. Review the payment manually." };
    }
    if (settled.status === "confirmed") {
      const event =
        payment.eventRegistration?.event ??
        payment.eventGuestSlots[0]?.registration.event;
      const booking = payment.bookings[0];
      await notifyPlayerBookingConfirmed({
        to: payment.user.email,
        playerName:
          payment.user.playerName ?? payment.user.name ?? "Bunal.club player",
        venueName: event?.hub.name ?? booking?.hub.name ?? "Your venue",
        bookingTitle: event?.title ?? booking?.court.name ?? "Your booking",
        schedule: event
          ? `${formatManilaDateLong(event.date)} · ${formatSlotRange(
              event.startHour,
              event.endHour
            )}`
          : booking
            ? `${formatManilaDateLong(booking.date)} · ${formatSlotRange(
                booking.startHour,
                booking.endHour
              )}`
            : "See your Bunal.club schedule for details",
        actionPath: event
          ? `/dashboard/bookings?q=${encodeURIComponent(event.publicId)}`
          : `/dashboard/bookings?q=${encodeURIComponent(payment.id)}`,
        idempotencyKey: `player-manual-booking-confirmed-${payment.id}`,
        paymentMode: "MANUAL",
      });
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
          manualReviewedById: workspace.actorId,
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
  await recordImpersonatedAction({
    action:
      decision === "approve"
        ? "MANUAL_PAYMENT_APPROVED"
        : "MANUAL_PAYMENT_DECLINED",
    targetType: "BookingPayment",
    targetId: payment.id,
    metadata: { note: note || null },
  });
  await recordPartnerActivity({
    workspace,
    action:
      decision === "approve"
        ? "MANUAL_PAYMENT_APPROVED"
        : "MANUAL_PAYMENT_DECLINED",
    targetType: "BookingPayment",
    targetId: payment.id,
    metadata: { note: note || null, module: requiredModule },
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
  const workspace = await getPartnerWorkspace();
  if (!workspace) return { message: "Partner workspace access is required." };
  if (workspace.kind !== "STAFF") {
    await requireRecentMfa("/dashboard/bookings");
  }
  const paymentId = value(formData, "paymentId", 40);
  const reference = value(formData, "reference", 120);
  const reason = value(formData, "reason", 500);
  const payment = await prisma.bookingPayment.findFirst({
    where: {
      id: paymentId,
      partnerId: workspace.partnerId,
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
  const requiredModule =
    payment.eventRegistration || payment.eventGuestSlots.length > 0
      ? "events"
      : "bookings";
  if (!hasStaffAccess(workspace, requiredModule, "MANAGE")) {
    return { message: `Manage access to ${requiredModule} is required.` };
  }
  await markBookingPaymentRefunded({
    paymentId: payment.id,
    amount: Number(payment.venueAmount),
    refundRef: reference || null,
    reason: reason || "Manual refund recorded by the venue.",
    refundedById: workspace.actorId,
  });
  revalidatePayment({
    id: payment.id,
    hubId: payment.hubId,
    eventPublicId:
      payment.eventRegistration?.event.publicId ??
      payment.eventGuestSlots[0]?.registration.event.publicId,
  });
  await recordImpersonatedAction({
    action: "MANUAL_REFUND_RECORDED",
    targetType: "BookingPayment",
    targetId: payment.id,
    metadata: {
      reference: reference || null,
      reason: reason || null,
    },
  });
  await recordPartnerActivity({
    workspace,
    action: "MANUAL_REFUND_RECORDED",
    targetType: "BookingPayment",
    targetId: payment.id,
    metadata: { reference: reference || null, module: requiredModule },
  });
  return {
    success:
      "Manual refund recorded. The venue amount was returned and the service fee remains non-refundable.",
  };
}
