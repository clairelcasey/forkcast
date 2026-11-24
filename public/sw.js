// Forkcast service worker: opens the app shell offline.
// - /_next/static and icons: cache-first (file names are content-hashed).
// - The home page: network-first; offline, the last loaded copy is shown.
// Meals typed offline go to the IndexedDB queue, not here.

const VERSION = "v1";
const STATIC_CACHE = `forkcast-static-${VERSION}`;
const PAGE_CACHE = `forkcast-pages-${VERSION}`;
const HOME = "/";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      for (const key of await caches.keys()) {
        if (key.startsWith("forkcast-") && !keep.has(key))
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/apple-icon")
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function homeNetworkFirst(request) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const response = await fetch(request);
    if (response.redirected) {
      // Signed out (sent to /login): forget the last user's page.
      await cache.delete(HOME);
    } else if (response.ok) {
      await cache.put(HOME, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(HOME)) ?? offlinePage();
  }
}

function offlinePage() {
  return new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Forkcast</title>
<body style="font-family:system-ui;padding:2rem;text-align:center">
<p>You're offline. Open Forkcast again when you have a connection.</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStatic(url)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate" && url.pathname === HOME) {
    event.respondWith(homeNetworkFirst(request));
  } else if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(offlinePage));
  }
});

self.addEventListener("message", (event) => {
  const data = event.data ?? {};
  if (data.type === "cache-static" && Array.isArray(data.urls)) {
    // Files the page loaded before this worker took control.
    event.waitUntil(
      caches.open(STATIC_CACHE).then((cache) =>
        Promise.all(
          data.urls
            .map((u) => new URL(u, self.location.origin))
            .filter((u) => u.origin === self.location.origin && isStatic(u))
            .map((u) => cache.add(u.pathname + u.search).catch(() => {})),
        ),
      ),
    );
  } else if (data.type === "sign-out") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});
