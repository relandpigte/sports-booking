import { z } from "zod";

import { searchOwnerAnalyticsOptions } from "@/lib/business-analytics";
import { getAuthenticatedUser } from "@/lib/dal";

const QuerySchema = z.object({
  kind: z.enum(["partner", "hub", "court"]),
  q: z.string().trim().max(100).optional(),
  partnerId: z.string().trim().min(1).max(100).optional(),
  hubId: z.string().trim().min(1).max(100).optional(),
});

export async function GET(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "ADMIN") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const result = QuerySchema.safeParse({
    kind: url.searchParams.get("kind"),
    q: url.searchParams.get("q") || undefined,
    partnerId: url.searchParams.get("partnerId") || undefined,
    hubId: url.searchParams.get("hubId") || undefined,
  });
  if (!result.success) {
    return Response.json(
      { error: "Invalid analytics option query" },
      { status: 400 }
    );
  }

  const options = await searchOwnerAnalyticsOptions({
    ...result.data,
    limit: 20,
  });
  return Response.json(options, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
