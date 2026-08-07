import "server-only";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";

export async function revalidatePartnerPaymentSurfaces(partnerId: string) {
  const hubs = await prisma.hub.findMany({
    where: { ownerId: partnerId },
    select: {
      id: true,
      slug: true,
      events: { select: { publicId: true } },
    },
  });

  revalidatePath("/dashboard/payments");
  revalidatePath("/dashboard/hubs");
  revalidatePath("/dashboard/hubs/new");
  revalidatePath("/dashboard/partner");
  revalidatePath("/hubs");
  revalidatePath("/events");

  const publicPaths = new Set<string>();
  for (const hub of hubs) {
    publicPaths.add(`/hubs/${hub.id}`);
    if (hub.slug) publicPaths.add(`/hubs/${hub.slug}`);
    for (const event of hub.events) {
      publicPaths.add(`/events/${event.publicId}`);
    }
  }
  for (const path of publicPaths) revalidatePath(path);
}
