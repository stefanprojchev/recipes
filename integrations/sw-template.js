/*
 * Service worker — offline support for the kitchen tablet.
 * Generated into dist/sw.js by integrations/service-worker.mjs, which
 * replaces __VERSION__ and __PRECACHE__. Plain JS: it is not bundled.
 *
 * - Pages: network first (a new weekly plan shows as soon as it's online),
 *   cached copy when offline. Only clean same-origin 200s are cached, so a
 *   Cloudflare Access login redirect is never stored as a page.
 * - Hashed build assets (/_astro/), fonts and media photos (keys carry a
 *   content hash): cache first — they never change. Photos are cached when
 *   first viewed; videos always stream from the network.
 * - Everything else same-origin: stale-while-revalidate.
 */
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;
const CACHE = `tavce-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // One by one: a single failure (e.g. Access session expired mid-install)
      // must not abort the whole install.
      for (const url of PRECACHE) {
        try {
          const response = await fetch(url, { credentials: "include", redirect: "follow" });
          if (isCacheable(response)) await cache.put(cacheKey(new URL(url, self.location.origin)), response);
        } catch (err) {
          console.warn("[sw] precache failed:", url, err);
        }
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("tavce-") && key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  // Videos stream with Range requests and can be large — never cached.
  if (url.pathname.startsWith("/media/videos/") && !url.pathname.endsWith("-poster.webp")) return;

  if (isPage(request, url)) {
    event.respondWith(networkFirst(request, url));
  } else if (
    url.pathname.startsWith("/_astro/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname.startsWith("/media/")
  ) {
    event.respondWith(cacheFirst(request, url));
  } else {
    event.respondWith(staleWhileRevalidate(event, request, url));
  }
});

/** Full navigations and ClientRouter's fetch of the next page's HTML. */
function isPage(request, url) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") && !/\.[a-z0-9]+$/i.test(url.pathname);
}

/** Pages are stored without query and with a trailing slash ("/recipes/zelnik/"). */
function cacheKey(url) {
  const key = new URL(url.href);
  key.search = "";
  key.hash = "";
  if (!/\.[a-z0-9]+$/i.test(key.pathname) && !key.pathname.endsWith("/")) key.pathname += "/";
  return key.href;
}

function isCacheable(response) {
  return response.ok && response.type === "basic";
}

async function networkFirst(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    // Redirects (trailing slash, Access login) pass straight through, uncached.
    if (isCacheable(response)) await cache.put(cacheKey(url), response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey(url));
    if (cached) return cached;
    const home = await cache.match(cacheKey(new URL("/", url)));
    if (home && request.mode === "navigate") return home;
    throw err;
  }
}

async function cacheFirst(request, url) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey(url));
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheable(response)) await cache.put(cacheKey(url), response.clone());
  return response;
}

async function staleWhileRevalidate(event, request, url) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(cacheKey(url));
  const refresh = fetch(request)
    .then(async (response) => {
      if (isCacheable(response)) await cache.put(cacheKey(url), response.clone());
      return response;
    })
    .catch((err) => {
      if (!cached) throw err;
      return cached;
    });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`network timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
