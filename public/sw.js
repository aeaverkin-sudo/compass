// ADED service worker. Static files come from the cache. Pages come from the network.
// A cached page is used only when the network rejects the request. A slow network waits.
// The cache name is the build id in the script URL (?v=), so a deploy drops the previous shell.
// Never cached: /api/*, the event cabinet (/e/*/manage*), stored files (/f/*), auth callbacks.

const version = new URL(self.location.href).searchParams.get("v") || "0";
const STATIC = `aded-static-${version}`;
const PAGES = `aded-pages-${version}`;
const SHELL = "/main";
const SHELLS = new Set(["/", "/main", "/profile", "/network", "/network/event", "/network/connections", "/network/data"]);
const STATIC_LIMIT = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PAGES);
        const response = await fetch(new Request(SHELL, { cache: "reload" }));
        if (response.ok && response.type === "basic" && !response.redirected) {
          await storeShell(cache, SHELL, response);
        }
      } catch {
        // The next online navigation fills the shell.
      }
      await self.skipWaiting();
    })(),
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

function staticUrls(html) {
  const urls = new Set();
  const re = /(?:href|src)\s*=\s*["']([^"']+)["']/g;
  let match = re.exec(html);
  while (match) {
    const value = match[1];
    const index = value.indexOf("/_next/static/");
    if (index !== -1) urls.add(value.slice(index));
    match = re.exec(html);
  }
  return [...urls];
}

async function storeShell(pageCache, path, response) {
  const html = await response.clone().text();
  await pageCache.put(path, response);
  const urls = staticUrls(html);
  if (urls.length === 0) return;
  const staticCache = await caches.open(STATIC);
  try {
    await staticCache.addAll(urls);
  } catch {
    await Promise.all(urls.map((url) => staticCache.add(url).catch(() => undefined)));
  }
  await trim(staticCache);
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

function loadPage(request, path) {
  const task = (async () => {
    const cache = await caches.open(PAGES);
    try {
      const response = await fetch(request);
      const store =
        response.ok && response.type === "basic" && !response.redirected && SHELLS.has(path)
          ? storeShell(cache, path, response.clone())
          : Promise.resolve();
      return { response, store };
    } catch (error) {
      const cached = (await cache.match(path)) || (path === "/" ? await cache.match(SHELL) : undefined);
      if (cached) return { response: cached, store: Promise.resolve() };
      throw error;
    }
  })();
  return {
    response: task.then((result) => result.response),
    store: task.then((result) => result.store).catch(() => undefined),
  };
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
  if (request.mode === "navigate") {
    const page = loadPage(request, path);
    event.respondWith(page.response);
    event.waitUntil(page.store);
  }
});
