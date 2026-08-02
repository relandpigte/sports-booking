import type { NextRequest } from "next/server";
import * as z from "zod";

import { getViewer } from "@/lib/dal";
import { getEventCourtAvailability } from "@/lib/events";
import { isValidDateString } from "@/lib/time";

export const dynamic = "force-dynamic";

const QuerySchema = z
  .object({
    hubId: z.string().min(1),
    date: z.string().refine(isValidDateString),
    startHour: z.coerce.number().int().min(0).max(23),
    endHour: z.coerce.number().int().min(1).max(24),
    eventId: z.string().optional(),
  })
  .refine((value) => value.endHour > value.startHour);

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (
    !viewer ||
    viewer.role !== "PARTNER" ||
    viewer.partnerStatus !== "ACTIVE"
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = QuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid availability query" }, { status: 400 });
  }

  const courts = await getEventCourtAvailability({
    ownerId: viewer.id,
    hubId: parsed.data.hubId,
    date: parsed.data.date,
    startHour: parsed.data.startHour,
    endHour: parsed.data.endHour,
    excludeEventId: parsed.data.eventId,
  });
  if (!courts) return Response.json({ error: "Hub not found" }, { status: 404 });
  return Response.json({ courts });
}
