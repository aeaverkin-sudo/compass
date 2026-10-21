// ADED service worker: static files from the cache, pages from the network with a cached shell to fall back on.
// Never cached: /api/*, the event cabinet (/e/*/manage*), stored files (/f/*), auth callbacks.

const STATIC = "aded-static-v1";
const PAGES = "aded-pages-v1";
const SHELL = "/main";
const SHELLS = new Set(["/", "/main", "/profile", "/network", "/network/event", "/network/connections", "/network/data"]);
const PAGE_TIMEOUT_MS = 3000;
const STATIC_LIMIT = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(new Request(SHELL, { cache: "reload" })))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC && key !== PAGES).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(path) {
  return (
    path.startsWith("/_next/static/") ||
    path.startsWith("/fonts/") ||
    path.startsWith("/icons/") ||
    path.startsWith("/brand/")
  );
}

function isPrivate(path) {
  return (
    path.startsWith("/api/") ||
    path.startsWith("/f/") ||
    path.startsWith("/auth/") ||
    /^\/e\/[^/]+\/manage(\/|$)/.test(path)
  );
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - STATIC_LIMIT;
  for (let index = 0; index < extra; index += 1) await cache.delete(keys[index]);
}

async function fromCacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    void trim(cache);
  }
  return response;
}

async function fromNetworkFirst(request, path) {
  const cache = await caches.open(PAGES);
  const network = fetch(request).then(async (response) => {
    if (response.ok && response.type === "basic" && !response.redirected && SHELLS.has(path)) {
      await cache.put(path, response.clone());
    }
    return response;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), PAGE_TIMEOUT_MS));
  const first = await Promise.race([network.catch(() => null), timeout]);
  if (first) return first;
  const cached = (await cache.match(path)) || (path === "/" ? await cache.match(SHELL) : undefined);
  if (cached) return cached;
  return network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (isPrivate(path)) return;
  if (isStatic(path)) {
    event.respondWith(fromCacheFirst(request));
    return;
  }
  if (request.mode === "navigate") event.respondWith(fromNetworkFirst(request, path));
});
