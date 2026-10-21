// ADED service worker. Static files come from the cache. A page comes from the network.
// The cached shell is used only when the network itself fails, and only with the build that saved it.
// Never cached: /api/*, the event cabinet (/e/*/manage*), stored files (/f/*), auth callbacks.

const version = new URL(self.location.href).searchParams.get("v") || "dev";
const STATIC = `aded-static-${version}`;
const PAGES = `aded-pages-${version}`;
const SHELL = "/main";
const SHELLS = new Set(["/", "/main", "/profile", "/network", "/network/event", "/network/connections", "/network/data"]);
const STATIC_LIMIT = 400;

self.addEventListener("install", (event) => {
  event.waitUntil(
    fetch(new Request(SHELL, { cache: "reload" }))
      .then((response) => {
        if (response.ok && response.type === "basic" && !response.redirected) return storeShell(SHELL, response);
      })
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

function assetUrls(html) {
  const found = new Set();
  const pattern = /(?:href|src)=["'](\/_next\/static\/[^"']+)["']/g;
  let match = pattern.exec(html);
  while (match) {
    found.add(match[1]);
    match = pattern.exec(html);
  }
  return [...found];
}

async function trim(cache) {
  const keys = await cache.keys();
  const extra = keys.length - STATIC_LIMIT;
  for (let index = 0; index < extra; index += 1) await cache.delete(keys[index]);
}

/** The shell is stored with the CSS and JS it points at, so an offline open still has its styles. */
async function storeShell(path, response) {
  const html = await response.clone().text();
  const pages = await caches.open(PAGES);
  await pages.put(path, response);
  const urls = assetUrls(html);
  if (!urls.length) return;
  const assets = await caches.open(STATIC);
  await Promise.all(
    urls.map(async (url) => {
      if (await assets.match(url)) return;
      try {
        const asset = await fetch(new Request(url, { cache: "reload" }));
        if (asset.ok && asset.type === "basic") await assets.put(url, asset);
      } catch {
        // One missing chunk must not drop the shell.
      }
    }),
  );
  void trim(assets);
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
  try {
    const response = await fetch(request);
    if (response.ok && response.type === "basic" && !response.redirected && SHELLS.has(path)) {
      await storeShell(path, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES);
    const cached = (await cache.match(path)) || (path === "/" ? await cache.match(SHELL) : undefined);
    if (cached) return cached;
    return fetch(request);
  }
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
