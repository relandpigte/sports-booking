// The QR renderer, decoded back.
//
//   npm run check:qr
//
// A QR that renders but doesn't scan is worse than no QR — nobody finds out
// until someone is standing at a counter with a phone. So this doesn't just
// assert the SVG looks plausible: it rebuilds the module matrix from the
// emitted path and checks it against the encoder's own, then confirms the
// finder patterns are where a scanner will look for them.
import qrcode from "qrcode-generator";
import sharp from "sharp";

import { ok, run } from "./harness";
import { HUB_QR_PNG_WIDTH, hubQrPng } from "@/lib/hub-qr-image";
import { hubQrSvg, qrSvg } from "@/lib/qr";

const QUIET = 2;

// Rebuild the dark/light grid from the path we emitted.
function decodeMatrix(svg: string, count: number, quiet = QUIET): boolean[][] {
  const grid = Array.from({ length: count }, () =>
    Array.from({ length: count }, () => false)
  );
  const path = svg.match(/<path d="([^"]*)"/)?.[1] ?? "";
  // Each run is M<x> <y>h<len>v1h-<len>z
  for (const run of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const x = Number(run[1]) - quiet;
    const y = Number(run[2]) - quiet;
    const len = Number(run[3]);
    for (let i = 0; i < len; i++) grid[y][x + i] = true;
  }
  return grid;
}

async function check() {
  const url = "https://checkout.paymongo.com/cs_abcdef1234567890";
  const svg = qrSvg(url);

  ok("it is an svg", svg.startsWith("<svg") && svg.endsWith("</svg>"));
  ok("with a viewBox, so CSS decides the size", /viewBox="0 0 \d+ \d+"/.test(svg));
  // On the <svg> element itself — the background <rect> legitimately has both.
  ok(
    "no fixed width or height on the root",
    !/<svg[^>]* (width|height)="/.test(svg)
  );
  ok(
    "crisp edges, so modules don't blur at small sizes",
    svg.includes('shape-rendering="crispEdges"')
  );
  ok("a white field behind it", svg.includes('fill="#ffffff"'));
  ok("labelled for screen readers", svg.includes('role="img"'));

  // The real test: does the drawing match what the encoder produced?
  const reference = qrcode(0, "M");
  reference.addData(url);
  reference.make();
  const count = reference.getModuleCount();

  const size = Number(svg.match(/viewBox="0 0 (\d+)/)![1]);
  ok("the quiet zone is included", size === count + QUIET * 2);

  const drawn = decodeMatrix(svg, count);
  let mismatches = 0;
  let dark = 0;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const expected = reference.isDark(row, col);
      if (expected) dark++;
      if (drawn[row][col] !== expected) mismatches++;
    }
  }
  ok("every module is drawn exactly where the encoder put it", mismatches === 0);
  ok("and the code isn't blank", dark > count);

  // Finder patterns: the three 7x7 squares a scanner locks onto. If the run
  // packing were off by one these would be the first thing to break.
  const finderAt = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const edge = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        if (drawn[r0 + r][c0 + c] !== (edge || core)) return false;
      }
    }
    return true;
  };
  ok("top-left finder pattern is intact", finderAt(0, 0));
  ok("top-right finder pattern is intact", finderAt(0, count - 7));
  ok("bottom-left finder pattern is intact", finderAt(count - 7, 0));

  // A longer URL must still encode — the version is chosen automatically.
  const long = qrSvg(`${url}?ref=${"x".repeat(200)}`);
  const longSize = Number(long.match(/viewBox="0 0 (\d+)/)![1]);
  ok("a longer payload picks a bigger version", longSize > size);
  ok("and still renders", long.includes("<path"));

  // Markup safety: the only interpolated values are ours, but a title still
  // has to not break out of the attribute.
  const titled = qrSvg(url, { title: 'Scan "now" <b>' });
  ok(
    "a quote in the title is escaped rather than breaking the attribute",
    titled.includes("aria-label=\"Scan &quot;now&quot; &lt;b&gt;\"")
  );
  ok(
    "and no raw markup survives",
    !titled.includes("<b>")
  );

  const logoDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWP4DwUMMAYAj4IP8cvlVgcAAAAASUVORK5CYII=";
  const branded = hubQrSvg("https://www.bunal.club/hubs/bunal-test", {
    hubName: 'Bunal Test & "Play"',
    logoDataUrl,
  });
  ok(
    "a hub download is a self-contained square SVG",
    branded.startsWith("<svg") &&
      branded.includes(logoDataUrl) &&
      /viewBox="0 0 (\d+) \1"/.test(branded)
  );
  ok(
    "the hub name is escaped in its accessible label",
    branded.includes("Bunal Test &amp; &quot;Play&quot;") &&
      !branded.includes('Bunal Test & "Play"')
  );
  ok(
    "the simplified artwork has no captions or decorative card",
    !branded.includes("<text") &&
      !branded.includes("www.bunal.club") &&
      !branded.includes("Scan to view") &&
      branded.includes('fill="#000000"')
  );
  ok(
    "the hub logo is centered on a white backing",
    branded.includes('id="hub-logo-clip"') &&
      /<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+" fill="#ffffff"\/>/.test(
        branded
      )
  );

  const brandedReference = qrcode(0, "H");
  brandedReference.addData("https://www.bunal.club/hubs/bunal-test");
  brandedReference.make();
  const brandedCount = brandedReference.getModuleCount();
  const brandedMatrix = decodeMatrix(branded, brandedCount, 4);
  let brandedMismatches = 0;
  for (let row = 0; row < brandedCount; row++) {
    for (let col = 0; col < brandedCount; col++) {
      if (brandedMatrix[row][col] !== brandedReference.isDark(row, col)) {
        brandedMismatches++;
      }
    }
  }
  ok(
    "the branded download retains the exact high-correction QR matrix",
    brandedMismatches === 0
  );

  const testLogo = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: "#d02020",
    },
  })
    .webp()
    .toBuffer();
  const webpLogoDataUrl = `data:image/webp;base64,${testLogo.toString("base64")}`;
  const png = await hubQrPng("https://www.bunal.club/hubs/bunal-test", {
    hubName: "Bunal Test Hub",
    logoDataUrl: webpLogoDataUrl,
  });
  const metadata = await sharp(png).metadata();
  ok(
    "the hub download is encoded as a high-resolution square PNG",
    png[0] === 0x89 &&
      png[1] === 0x50 &&
      png[2] === 0x4e &&
      png[3] === 0x47 &&
      metadata.format === "png" &&
      metadata.width === HUB_QR_PNG_WIDTH &&
      metadata.height === HUB_QR_PNG_WIDTH
  );
  ok(
    "the PNG is flattened without an alpha channel",
    metadata.hasAlpha === false
  );

  const raster = await sharp(png)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const brandedSize = brandedCount + 8;
  const scale = raster.info.width / brandedSize;
  const logoBacking = branded.match(
    /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="#ffffff"\/>/
  );
  if (!logoBacking) throw new Error("Hub logo backing was not rendered");
  const logoCenterX = Number(logoBacking[1]);
  const logoCenterY = Number(logoBacking[2]);
  const logoRadius = Number(logoBacking[3]);
  const centerOffset =
    (Math.floor(raster.info.height / 2) * raster.info.width +
      Math.floor(raster.info.width / 2)) *
    raster.info.channels;
  ok(
    "an uploaded WebP hub logo remains visible in the PNG",
    raster.data[centerOffset] > 180 &&
      raster.data[centerOffset + 1] < 80 &&
      raster.data[centerOffset + 2] < 80
  );
  let pngMismatches = 0;
  let checkedModules = 0;
  for (let row = 0; row < brandedCount; row++) {
    for (let col = 0; col < brandedCount; col++) {
      const moduleX = 4 + col + 0.5;
      const moduleY = 4 + row + 0.5;
      if (
        Math.hypot(moduleX - logoCenterX, moduleY - logoCenterY) <=
        logoRadius
      ) {
        continue;
      }

      checkedModules++;
      const x = Math.floor(moduleX * scale);
      const y = Math.floor(moduleY * scale);
      const offset = (y * raster.info.width + x) * raster.info.channels;
      const luminance =
        (raster.data[offset] +
          raster.data[offset + 1] +
          raster.data[offset + 2]) /
        3;
      if ((luminance < 128) !== brandedReference.isDark(row, col)) {
        pngMismatches++;
      }
    }
  }
  ok(
    "the centered logo stays within the high-correction allowance",
    Math.PI * logoRadius * logoRadius < brandedSize * brandedSize * 0.03
  );
  ok(
    "the PNG preserves every unobscured QR module at its center",
    checkedModules > 0 && pngMismatches === 0
  );
}

void run(check);
