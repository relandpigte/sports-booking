"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { isPartnerImpersonationActive } from "@/lib/impersonation";
import { publishMessageEvent } from "@/lib/messages-realtime";

const ReviewSchema = z.object({
  reportId: z.string().min(1),
  decision: z.enum(["RESOLVED", "DISMISSED"]),
  resolution: z.string().trim().min(3).max(500),
  removeMessage: z.boolean(),
  restrictSender: z.boolean(),
});

export async function reviewMessageReportAction(formData: FormData) {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) return;
  const parsed = ReviewSchema.safeParse({
    reportId: String(formData.get("reportId") ?? ""),
    decision: String(formData.get("decision") ?? ""),
    resolution: String(formData.get("resolution") ?? ""),
    removeMessage: formData.get("removeMessage") === "on",
    restrictSender: formData.get("restrictSender") === "on",
  });
  if (!parsed.success) return;
  const report = await prisma.chatReport.findUnique({
    where: { id: parsed.data.reportId },
    select: {
      id: true,
      message: { select: { id: true, senderId: true, conversationId: true } },
    },
  });
  if (!report) return;
  await prisma.$transaction(async (tx) => {
    await tx.chatReport.update({
      where: { id: report.id },
      data: {
        status: parsed.data.decision,
        resolution: parsed.data.resolution,
        reviewerId: admin.id,
        reviewedAt: new Date(),
      },
    });
    if (parsed.data.removeMessage) {
      await tx.chatMessage.updateMany({
        where: { id: report.message.id, deletedAt: null },
        data: { body: null, deletedAt: new Date(), deletedById: admin.id },
      });
    }
    if (parsed.data.restrictSender && report.message.senderId !== admin.id) {
      await tx.user.updateMany({
        where: { id: report.message.senderId ?? "", chatRestrictedAt: null },
        data: {
          chatRestrictedAt: new Date(),
          chatRestrictionReason: parsed.data.resolution,
          chatRestrictedById: admin.id,
        },
      });
    }
  });
  await publishMessageEvent(report.message.conversationId, "deleted");
  revalidatePath("/dashboard/admin/messages");
}

export async function liftMessageRestrictionAction(formData: FormData) {
  const admin = await requireAdmin();
  if (await isPartnerImpersonationActive()) return;
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === admin.id) return;
  await prisma.user.updateMany({
    where: { id: userId },
    data: {
      chatRestrictedAt: null,
      chatRestrictionReason: null,
      chatRestrictedById: null,
    },
  });
  revalidatePath("/dashboard/admin/messages");
}
