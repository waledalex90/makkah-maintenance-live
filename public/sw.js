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

self.addEventListener("fetch", function (event) {
  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(event.request);
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
    const options = {
      ...base,
      icon: base.icon || "/icons/icon-192.png",
      badge: base.badge || "/icons/icon-192.png",
      vibrate: base.vibrate || [180, 80, 180],
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
  const url = data.url || (ticketId ? `/dashboard/tickets?ticketId=${ticketId}` : "/dashboard/tickets");

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: `ticket-${ticketId || Date.now()}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      vibrate: [200, 100, 200],
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
