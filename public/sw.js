const CACHE_PREFIX = "bunal-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v4`;
const OFFLINE_URL = "/offline.html";
const OFFLINE_ASSETS = [
  OFFLINE_URL,
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/pwa-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never intercept form submissions or Next.js Server Action POSTs. A failed
  // mutation must remain on the current page instead of becoming an offline
  // navigation inside the installed app.
  if (request.method !== "GET") return;

  if (OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((response) => response || fetch(request))
    );
    return;
  }

  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OFFLINE_URL).then((response) => response || Response.error())
    )
  );
});
