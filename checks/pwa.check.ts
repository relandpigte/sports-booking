import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import nextConfig from "../next.config";
import manifest from "../src/app/manifest";

async function pngDimensions(file: string) {
  const bytes = await readFile(path.join(process.cwd(), "public", file));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

async function main() {
  const root = process.cwd();
  const appManifest = manifest();

  assert.equal(appManifest.start_url, "/dashboard");
  assert.equal(appManifest.scope, "/");
  assert.equal(appManifest.display, "standalone");
  assert.equal(appManifest.theme_color, "#10243a");
  assert.deepEqual(
    appManifest.icons?.map((icon) => [icon.src, icon.sizes, icon.purpose]),
    [
      ["/pwa-icon-192.png", "192x192", "any"],
      ["/pwa-icon-512.png", "512x512", "any"],
      ["/pwa-maskable-512.png", "512x512", "maskable"],
    ]
  );

  assert.deepEqual(await pngDimensions("pwa-icon-192.png"), [192, 192]);
  assert.deepEqual(await pngDimensions("pwa-icon-512.png"), [512, 512]);
  assert.deepEqual(await pngDimensions("pwa-maskable-512.png"), [512, 512]);

  const worker = await readFile(path.join(root, "public", "sw.js"), "utf8");
  assert.match(worker, /OFFLINE_ASSETS/);
  assert.match(worker, /request\.mode !== "navigate"/);
  assert.doesNotMatch(worker, /cache\.put/);

  const offline = await readFile(
    path.join(root, "public", "offline.html"),
    "utf8"
  );
  assert.match(
    offline,
    /Live court availability and booking changes need a connection/
  );

  const configuredHeaders = await nextConfig.headers?.();
  const workerHeaders = configuredHeaders?.find(
    (entry) => entry.source === "/sw.js"
  );
  assert(workerHeaders);
  assert(
    workerHeaders.headers.some(
      (header) =>
        header.key === "Cache-Control" &&
        header.value === "no-cache, no-store, must-revalidate"
    )
  );

  console.log("pwa check passed");
}

void main();
