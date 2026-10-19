import { parseUserDirectoryFilters } from "@/lib/admin-user-filters";
import { exportUsersCsv } from "@/lib/admin-user-export";

// Downloads the Manage Users directory as CSV, using the same filters as the
// page (q, role, trainer, profileStatus) but every page of results.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = parseUserDirectoryFilters(
    (name) => params.get(name) ?? undefined
  );
  const result = await exportUsersCsv(filters);
  if (!result) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
