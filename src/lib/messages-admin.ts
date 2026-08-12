import "server-only";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function listMessageReports(status: "OPEN" | "RESOLVED" | "DISMISSED") {
  await requireAdmin();
  return prisma.chatReport.findMany({
    where: { status },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take: 100,
    select: {
      id: true,
      category: true,
      details: true,
      evidenceBody: true,
      status: true,
      resolution: true,
      reviewerId: true,
      reviewedAt: true,
      createdAt: true,
      reporter: { select: { id: true, name: true, playerName: true, email: true } },
      message: {
        select: {
          id: true,
          senderId: true,
          body: true,
          deletedAt: true,
          createdAt: true,
          sender: { select: { id: true, name: true, playerName: true, email: true } },
          conversation: {
            select: {
              kind: true,
              hub: { select: { name: true } },
              event: { select: { title: true } },
            },
          },
        },
      },
    },
  });
}

export async function listRestrictedMessageUsers() {
  await requireAdmin();
  return prisma.user.findMany({
    where: { chatRestrictedAt: { not: null } },
    orderBy: { chatRestrictedAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      playerName: true,
      email: true,
      chatRestrictedAt: true,
      chatRestrictionReason: true,
    },
  });
}
