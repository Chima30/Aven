/*
 * AVEN service worker.
 *
 * Privacy rule: pages are NEVER cached, because signed-in pages contain
 * personal data and this device may be shared. Only immutable build assets
 * (/_next/static), icons and the public /offline page are cached.
 *
 * Offline DATA (queued changes) lives in IndexedDB, not here.
 */
const VERSION = "v2";
const STATIC_CACHE = `aven-static-${VERSION}`;
const SHELL_CACHE = `aven-shell-${VERSION}`;
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

// Also cache the scripts and styles the offline page needs, so offline
// transaction entry works even if those files were never loaded before.
async function precacheOfflinePage() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL_ASSETS);
  const response = await shell.match(OFFLINE_URL);
  if (!response) return;
  const html = await response.text();
  const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
  const statics = await caches.open(STATIC_CACHE);
  await Promise.all(assets.map((url) => statics.add(url).catch(() => undefined)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("aven-") && key !== STATIC_CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always go to the network; show the offline page if that fails.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(OFFLINE_URL)) ?? Response.error();
      }),
    );
    return;
  }

  // Hashed build assets never change, so cache-first is safe.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
  // Everything else (data, auth, API) goes straight to the network, uncached.
});
