import "server-only";

import { Prisma } from "@prisma/client";

// PostgreSQL advisory locks give a player-hour a transaction-scoped mutex.
// Court occupancy is protected separately by BookingSlot's unique index; this
// lock prevents the same player from concurrently claiming two DIFFERENT
// courts for the same time after both requests passed the initial read check.
export async function lockPlayerBookingHours(
  tx: Prisma.TransactionClient,
  userId: string,
  date: string,
  hours: number[]
): Promise<void> {
  const playerKey = `booking-player:${userId}`;
  for (const hour of [...new Set(hours)].sort((left, right) => left - right)) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${playerKey}),
        hashtext(${`${date}:${hour}`})
      )::text AS "locked"
    `;
  }
}
