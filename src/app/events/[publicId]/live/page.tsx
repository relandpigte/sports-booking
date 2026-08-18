import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/db";

export default async function LegacyEventLivePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const event = await prisma.event.findUnique({
    where: { publicId, status: { in: ["PUBLISHED", "CANCELLED"] } },
    select: { openPlayQueue: { select: { publicId: true } } },
  });
  if (!event) notFound();
  if (!event.openPlayQueue) notFound();
  redirect(`/q/${event.openPlayQueue.publicId}`);
}
