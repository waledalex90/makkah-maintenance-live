const CACHE_NAME = "makkah-ops-v2";
const APP_SHELL = ["/", "/dashboard", "/dashboard/tickets", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Basic fetch listener required for PWA capability scanners.
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isStaticAsset =
    event.request.destination === "script" ||
    event.request.destination === "style" ||
    event.request.destination === "image" ||
    event.request.destination === "font";

  // Avoid aggressive force-cache behavior; prefer network for navigations and API,
  // but fallback to cached data when offline.
  if (event.request.mode === "navigate" || !isStaticAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const dashboardFallback = await caches.match("/dashboard");
          if (dashboardFallback) return dashboardFallback;
          const rootFallback = await caches.match("/");
          return rootFallback || Response.error();
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return networkResponse;
        })
        .catch(() => Response.error());
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});
