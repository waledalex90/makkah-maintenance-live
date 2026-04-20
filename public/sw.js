/**
 * Service Worker — إشعارات وتخزين مؤقت.
 * ملاحظة: إغلاق المتصفح بالكامل (Hard Close) يوقف التنفيذ على معظم الأنظمة؛
 * الإشعارات الفورية تعمل عند إعادة الفتح أو مع إبقاء المتصفح في الخلفية.
 */
const CACHE_NAME = "makkah-ops-v6-upflow";
const STATIC_ASSETS = [
  "/manifest.webmanifest?v=3",
  "/icons/icon-192.png?v=3",
  "/icons/icon-512.png?v=3",
  "/android-chrome-192x192.png?v=3",
  "/android-chrome-512x512.png?v=3",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
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
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;

  // Never intercept app/document navigation:
  // keep tab switching and route navigation on pure network.
  if (request.mode === "navigate") return;

  const pathname = url.pathname;
  const isNextAsset = pathname.startsWith("/_next/");
  const isApi = pathname.startsWith("/api/");
  if (isNextAsset || isApi) return;

  const isStaticAsset =
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/screenshots/");

  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => cached);

      return cached ?? network;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const title = event.data.title || "تنبيه جديد";
    const base = event.data.options || {};
    const uniqueTag =
      typeof base.tag === "string" && base.tag.length > 0
        ? base.tag
        : `makkah-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const options = {
      ...base,
      tag: uniqueTag,
      renotify: true,
      icon: base.icon || "/icons/icon-192.png",
      badge: base.badge || "/icons/icon-192.png",
      vibrate: base.vibrate || [200, 100, 200, 100, 200],
      silent: false,
      requireInteraction: base.requireInteraction !== false,
    };
    void self.registration.showNotification(title, options);
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "بلاغ جديد", body: event.data?.text?.() ?? "تم استلام إشعار جديد." };
  }

  const data = payload && typeof payload === "object" ? payload : {};
  const title = data.title || "بلاغ جديد";
  const body = data.body || "يوجد بلاغ جديد في منطقتك.";
  const ticketId = data.ticketId || data.ticket_id || "";
  const url = data.url || (ticketId ? `/dashboard/tickets?open=${ticketId}` : "/dashboard/tickets");
  const pushTag =
    typeof data.tag === "string" && data.tag.length > 0
      ? data.tag
      : `push-${ticketId || "gen"}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: pushTag,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [200, 100, 200, 100, 200],
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url, ticketId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/dashboard/tickets";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const existing = windowClients.find((client) => "focus" in client);
      if (existing) {
        return existing.focus().then(() => existing.navigate(targetUrl));
      }
      return clients.openWindow(targetUrl);
    }),
  );
});
