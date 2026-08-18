import "server-only";

import { prisma } from "@/lib/db";

export async function listOperationalRecipients(
  partnerId: string,
  module: "bookings" | "events"
) {
  const partner = await prisma.user.findUnique({
    where: { id: partnerId },
    select: {
      id: true,
      email: true,
      name: true,
      playerName: true,
      staffMembershipsOwned: {
        where: { [module]: "MANAGE" },
        select: {
          id: true,
          user: { select: { email: true, name: true, playerName: true } },
        },
      },
    },
  });
  if (!partner) return [];
  return [
    {
      key: `owner-${partner.id}`,
      email: partner.email,
      name: partner.playerName ?? partner.name ?? "Partner",
    },
    ...partner.staffMembershipsOwned.map((membership) => ({
      key: `staff-${membership.id}`,
      email: membership.user.email,
      name:
        membership.user.playerName ?? membership.user.name ?? "Team member",
    })),
  ];
}
