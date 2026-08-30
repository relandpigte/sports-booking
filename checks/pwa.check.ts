import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

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
  assert.match(worker, /request\.method !== "GET"/);
  assert.match(worker, /request\.mode !== "navigate"/);
  assert.doesNotMatch(worker, /cache\.put/);

  const workerListeners = new Map<string, (event: unknown) => void>();
  vm.runInNewContext(worker, {
    URL,
    Response,
    caches: {
      keys: async () => [],
      open: async () => ({ addAll: async () => undefined }),
      match: async () => undefined,
      delete: async () => true,
    },
    fetch: async () => new Response("ok"),
    self: {
      location: { origin: "https://www.bunal.club" },
      addEventListener: (name: string, listener: (event: unknown) => void) =>
        workerListeners.set(name, listener),
      skipWaiting: () => undefined,
      clients: { claim: async () => undefined },
    },
  });
  const fetchListener = workerListeners.get("fetch");
  assert(fetchListener);
  let postIntercepted = false;
  fetchListener({
    request: {
      url: "https://www.bunal.club/dashboard/bunalq/example",
      method: "POST",
      mode: "navigate",
    },
    respondWith: () => {
      postIntercepted = true;
    },
  });
  assert.equal(postIntercepted, false);

  let navigationIntercepted = false;
  fetchListener({
    request: {
      url: "https://www.bunal.club/dashboard/bunalq/example",
      method: "GET",
      mode: "navigate",
    },
    respondWith: () => {
      navigationIntercepted = true;
    },
  });
  assert.equal(navigationIntercepted, true);

  const bunalQActionState = await readFile(
    path.join(root, "src", "hooks", "useBunalQActionState.ts"),
    "utf8"
  );
  assert.match(bunalQActionState, /try \{/);
  assert.match(bunalQActionState, /reloadRequired: true/);
  assert.match(bunalQActionState, /Reload this page/);

  const installBanner = await readFile(
    path.join(root, "src", "components", "pwa", "PublicInstallBanner.tsx"),
    "utf8"
  );
  assert.match(installBanner, /Add Bunal\.club/);
  assert.match(installBanner, /promptInstall/);
  assert.match(installBanner, /Add to Home Screen/);
  assert.match(installBanner, /bunal\.pwa-install-dismissed-at/);

  const homepage = await readFile(
    path.join(root, "src", "components", "home", "HomePage.tsx"),
    "utf8"
  );
  assert.match(homepage, /<PublicInstallBanner \/>/);

  const hubQrDownload = await readFile(
    path.join(
      root,
      "src",
      "components",
      "dashboard",
      "hubs",
      "HubQrDownloadButton.tsx"
    ),
    "utf8"
  );
  assert.match(hubQrDownload, /navigator\.canShare\(\{ files:/);
  assert.match(hubQrDownload, /new File\(\[blob\]/);
  assert.doesNotMatch(hubQrDownload, /window\.location/);

  const manualCheckout = await readFile(
    path.join(
      root,
      "src",
      "components",
      "bookings",
      "ManualPaymentCheckout.tsx"
    ),
    "utf8"
  );
  assert.match(manualCheckout, /navigator\.canShare\(\{ files:/);
  assert.match(manualCheckout, /Save QR image/);
  assert.doesNotMatch(manualCheckout, /Open the image/);

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
