/*
 * Parvazyab service worker.
 *
 * - Pages: network first (always the latest deploy), falling back to the last
 *   app shell so the app still opens offline; the offline page covers a first
 *   visit with no network.
 * - Hashed build assets, fonts and icons: cache first. Their names change with
 *   their content, so a cached copy is never stale; the cache is trimmed.
 * - The API is never cached: its answers are private or change by the minute.
 * - Push: shows the notification the server sent and opens its in-app link.
 *
 * Changing this file is enough to roll out a new worker; bump the cache names
 * only to throw old caches away.
 */
const SHELL_CACHE = "pvz-shell-v1";
const STATIC_CACHE = "pvz-static-v1";
const STATIC_LIMIT = 120;
const SHELL_URLS = ["/offline.html", "/logo.svg", "/icons/icon-192.png"];

/**
 * The shell and the hashed assets it references (entry script, styles,
 * preloads). On a first visit the page loaded those before this worker was in
 * control, so they wouldn't be cached otherwise, and an offline start would
 * find the shell without its code.
 */
async function precacheShell() {
  const shell = await caches.open(SHELL_CACHE);
  await shell.addAll(SHELL_URLS);
  const response = await fetch("/", { cache: "reload" });
  if (!response.ok) return;
  const html = await response.clone().text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
  await (await caches.open(STATIC_CACHE)).addAll(assets);
  await shell.put("/", response);
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, STATIC_CACHE]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

/** Oldest entries go first once the static cache grows past its limit (old deploys' assets). */
async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT))) await cache.delete(request);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

async function page(event) {
  const url = new URL(event.request.url);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    // Every app route is the same shell; remember the newest one. (Other pages,
    // like server-rendered route pages, are not the shell and aren't kept.)
    if (response.ok && url.pathname === "/") {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (
      (url.pathname.startsWith("/flights") ? null : await cache.match("/")) || (await cache.match("/offline.html"))
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(page(event));
  } else if (/^\/(assets|fonts|icons)\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "پروازیاب", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      lang: "fa",
      dir: "rtl",
      // A newer notification for the same alert replaces the older one.
      tag: data.tag,
      data: { link: data.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link || "/", self.location.origin);
  // Only ever open this site's own pages.
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === target.origin);
      if (open) {
        await open.focus();
        return open.navigate(target.href);
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
