import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { hubQrPng } from "@/lib/hub-qr-image";
import { hubPublicPath } from "@/lib/hub-slug";
import { absoluteUrl } from "@/lib/site";
import { requirePartnerWorkspace } from "@/lib/staffing";

export const dynamic = "force-dynamic";

function downloadName(name: string): string {
  const safe = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${safe || "hub"}-qr.png`;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ hubId: string }> }
) {
  const workspace = await requirePartnerWorkspace("hubs");
  const { hubId } = await ctx.params;
  const hub = await prisma.hub.findFirst({
    where: { id: hubId, ownerId: workspace.partnerId },
    select: { id: true, name: true, slug: true, logo: true },
  });
  if (!hub) return new Response("Hub not found", { status: 404 });

  const fallbackLogo = await readFile(
    path.join(process.cwd(), "public", "bunal-logo-v2-wordmark.png")
  );
  const logoDataUrl = hub.logo?.startsWith("data:image/")
    ? hub.logo
    : `data:image/png;base64,${fallbackLogo.toString("base64")}`;
  const png = await hubQrPng(absoluteUrl(hubPublicPath(hub)), {
    hubName: hub.name,
    logoDataUrl,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${downloadName(hub.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
