import "server-only";

import sharp from "sharp";

import { hubQrSvg } from "@/lib/qr";

export const HUB_QR_PNG_WIDTH = 1440;

async function portableLogoDataUrl(dataUrl: string): Promise<string> {
  const encoded = dataUrl.match(
    /^data:image\/(?:png|jpe?g|webp);base64,([a-zA-Z0-9+/=]+)$/
  )?.[1];
  if (!encoded) throw new Error("Hub QR logo is not a supported image data URL");

  // librsvg does not consistently render embedded WebP images. Normalizing the
  // already-sanitized venue logo to PNG keeps it visible in every deployment.
  const png = await sharp(Buffer.from(encoded, "base64")).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

// Keep the downloadable artwork deliberately simple: a high-resolution square
// QR, a spec-compliant quiet zone, and the venue identity in the center. PNG
// avoids the compression artifacts that can make printed QR modules harder to
// scan.
export async function hubQrPng(
  data: string,
  opts: { hubName: string; logoDataUrl: string }
): Promise<Buffer> {
  const logoDataUrl = await portableLogoDataUrl(opts.logoDataUrl);
  const svg = hubQrSvg(data, { ...opts, logoDataUrl });

  return sharp(Buffer.from(svg), { density: 1800 })
    .resize({
      width: HUB_QR_PNG_WIDTH,
      height: HUB_QR_PNG_WIDTH,
      fit: "fill",
      kernel: sharp.kernel.nearest,
    })
    .flatten({ background: "#ffffff" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
