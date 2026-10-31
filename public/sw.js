// Shows push reminders and opens the app when one is tapped, and shows our own "You're offline" page when a page is opened with no
// internet (2026-10-31). Registered on every visit (ServiceWorkerSetup.tsx). Only the offline page and the logo are kept on the device:
// nothing else is cached, so the app is never served stale.
const OFFLINE_CACHE = "bnp-offline-v1";
const OFFLINE_URL = "/offline.html";
const OFFLINE_FILES = [OFFLINE_URL, "/logo-mark.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.addAll(OFFLINE_FILES.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("bnp-offline-") && k !== OFFLINE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  // Opening a page: the network as always; only when that fails (no internet) the saved offline page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(OFFLINE_URL).then((saved) =>
          saved
            ? saved.text().then((html) => new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }))
            : Response.error(),
        ),
      ),
    );
    return;
  }
  // The offline page's own logo, when there is no network to fetch it from.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname === "/logo-mark.png") {
    event.respondWith(fetch(req).catch(() => caches.match("/logo-mark.png").then((r) => r || Response.error())));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Bass Note Piano", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Bass Note Piano", {
      body: data.body || "",
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url || "/dashboard" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
