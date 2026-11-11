// Shows push reminders and opens the app when one is tapped, and shows our own "You're offline" page when a page is opened with no
// internet (2026-10-31), and our own "Under maintenance" page instead of Netlify's "Site not available" when the host has paused the
// site for usage limits. Registered on every visit (ServiceWorkerSetup.tsx). Only those two pages and the logo are kept on the device:
// nothing else is cached, so the app is never served stale.
const OFFLINE_CACHE = "bnp-offline-v4";
const OFFLINE_URL = "/offline.html";
const MAINTENANCE_URL = "/maintenance.html";
const OFFLINE_FILES = [OFFLINE_URL, MAINTENANCE_URL, "/logo-mark.png"];

/** A saved page, served as a fresh 200 so the browser shows it as the page. */
function savedPage(url) {
  return caches.match(url).then((saved) =>
    saved ? saved.text().then((html) => new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })) : null,
  );
}

/**
 * Netlify's own answer when the site is paused for usage limits: a 503 from Netlify (not from the app) whose page says so. Read only on
 * a 503, so a normal page costs nothing extra.
 */
function isHostPaused(res) {
  if (res.status !== 503) return Promise.resolve(false);
  return res
    .clone()
    .text()
    .then((body) => /usage limits|usage_exceeded|Site not available/i.test(body))
    .catch(() => false);
}

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
  // Opening a page: the network as always; the saved maintenance page when the host has paused the site, and the saved offline page
  // when there is no internet at all.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then(
        (res) => isHostPaused(res).then((paused) => (paused ? savedPage(MAINTENANCE_URL).then((page) => page || res) : res)),
        () => savedPage(OFFLINE_URL).then((page) => page || Response.error()),
      ),
    );
    return;
  }
  // The offline and maintenance pages' own logo, when there is no network to fetch it from or the paused host will not serve it.
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname === "/logo-mark.png") {
    const saved = () => caches.match("/logo-mark.png").then((r) => r || Response.error());
    event.respondWith(fetch(req).then((res) => (res.ok ? res : saved()), saved));
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
  // Only an address on this site is ever opened, whatever the push says.
  let url = (event.notification.data && event.notification.data.url) || "/dashboard";
  try {
    const parsed = new URL(url, self.location.origin);
    url = parsed.origin === self.location.origin ? parsed.pathname + parsed.search + parsed.hash : "/dashboard";
  } catch (e) {
    url = "/dashboard";
  }
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
