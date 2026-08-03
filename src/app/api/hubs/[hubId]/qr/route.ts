import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { requireActivePartner } from "@/lib/dal";
import { hubPublicPath } from "@/lib/hub-slug";
import { hubQrSvg } from "@/lib/qr";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

function downloadName(name: string): string {
  const safe = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "hub"}-bunal-qr.svg`;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ hubId: string }> }
) {
  const partner = await requireActivePartner();
  const { hubId } = await ctx.params;
  const hub = await prisma.hub.findFirst({
    where: { id: hubId, ownerId: partner.id },
    select: { id: true, name: true, slug: true },
  });
  if (!hub) return new Response("Hub not found", { status: 404 });

  const logo = await readFile(
    path.join(process.cwd(), "public", "bunal-logo-v2-wordmark.png")
  );
  const svg = hubQrSvg(absoluteUrl(hubPublicPath(hub)), {
    hubName: hub.name,
    logoDataUrl: `data:image/png;base64,${logo.toString("base64")}`,
  });

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${downloadName(hub.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
