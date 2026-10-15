import type { Prisma } from "@prisma/client";

// Courts appear in the order the venue arranged them in the Hub form. Ties
// (courts created outside that form, e.g. fixtures) fall back to creation order.
export const courtDisplayOrder: Prisma.CourtOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { createdAt: "asc" },
];

// The same order for `EventCourt` join rows.
export const eventCourtDisplayOrder: Prisma.EventCourtOrderByWithRelationInput[] =
  courtDisplayOrder.map((court) => ({ court }));
