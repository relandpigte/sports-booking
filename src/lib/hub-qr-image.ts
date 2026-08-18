import "server-only";

import path from "node:path";

import sharp, { type OverlayOptions } from "sharp";

import { hubQrSvg } from "@/lib/qr";

export const HUB_QR_JPEG_WIDTH = 1200;
const HUB_QR_FONT_PATH = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "compiled",
  "@vercel",
  "og",
  "Geist-Regular.ttf"
);

function escapePangoMarkup(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

function displayHubName(name: string): string {
  return name.length > 34 ? `${name.slice(0, 33).trimEnd()}…` : name;
}

// Hub QR downloads are shared on social media and printed at venue counters.
// Render the scalable source at a high density before encoding so the JPEG's
// lossy compression cannot soften the individual QR modules enough to affect
// scanning.
export async function hubQrJpeg(
  data: string,
  opts: { hubName: string; logoDataUrl: string }
): Promise<Buffer> {
  // librsvg falls back to visible square glyphs when the deployment image does
  // not have the font referenced by an SVG <text> node. Rasterize the QR card
  // without SVG text, then composite labels with an explicit bundled font so
  // exports are identical locally, on Vercel, and inside the installed PWA.
  const svg = hubQrSvg(data, { ...opts, renderText: false });
  const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBox) throw new Error("Hub QR artwork is missing its viewBox");

  const artworkWidth = Number(viewBox[1]);
  const scale = HUB_QR_JPEG_WIDTH / artworkWidth;
  const qrSize = artworkWidth - 20;
  const qrY = 28;
  const horizontalInset = Math.round(6 * scale);
  const textWidth = HUB_QR_JPEG_WIDTH - horizontalInset * 2;

  const textLayer = (
    text: string,
    color: string,
    top: number,
    height: number,
    weight: "normal" | "bold" = "normal"
  ): OverlayOptions => ({
    input: {
      text: {
        text: `<span foreground="${color}" weight="${weight}">${escapePangoMarkup(text)}</span>`,
        font: "Geist",
        fontfile: HUB_QR_FONT_PATH,
        width: textWidth,
        height: Math.round(height * scale),
        align: "center",
        rgba: true,
        wrap: "none",
      },
    },
    left: horizontalInset,
    top: Math.round(top * scale),
  });

  return sharp(Buffer.from(svg), { density: 1800 })
    .resize({ width: HUB_QR_JPEG_WIDTH })
    .flatten({ background: "#ffffff" })
    .composite([
      textLayer(displayHubName(opts.hubName), "#10243a", 18, 6, "bold"),
      textLayer(
        "Scan to view & book courts",
        "#0b8643",
        qrY + qrSize + 4,
        6,
        "bold"
      ),
      textLayer("www.bunal.club", "#64748b", qrY + qrSize + 11, 4),
    ])
    .jpeg({
      quality: 100,
      chromaSubsampling: "4:4:4",
      mozjpeg: true,
    })
    .toBuffer();
}
