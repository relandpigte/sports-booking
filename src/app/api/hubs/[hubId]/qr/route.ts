import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/db";
import { hubQrJpeg } from "@/lib/hub-qr-image";
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
  return `${safe || "hub"}-bunal-qr.jpg`;
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ hubId: string }> }
) {
  const workspace = await requirePartnerWorkspace("hubs");
  const { hubId } = await ctx.params;
  const hub = await prisma.hub.findFirst({
    where: { id: hubId, ownerId: workspace.partnerId },
    select: { id: true, name: true, slug: true },
  });
  if (!hub) return new Response("Hub not found", { status: 404 });

  const logo = await readFile(
    path.join(process.cwd(), "public", "bunal-logo-v2-wordmark.png")
  );
  const jpeg = await hubQrJpeg(absoluteUrl(hubPublicPath(hub)), {
    hubName: hub.name,
    logoDataUrl: `data:image/png;base64,${logo.toString("base64")}`,
  });

  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": `attachment; filename="${downloadName(hub.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
