// Deliberately hand-rolled instead of a build-plugin (next-pwa/serwist)
// - this app's caching needs are simple (two rules, see fetch handler
// below), and a plugin's Turbopack compatibility with Next 16 wasn't
// worth gambling on for that little benefit.
const CACHE_VERSION = "v1";
const STATIC_CACHE = `getfitaf-static-${CACHE_VERSION}`;

// Next.js content-hashes its static build output, so a cached copy of
// anything under /_next/static/ is never stale by definition - if the
// content changed, the URL changed too. Icons/favicons are also safe
// to cache aggressively since they only change when we redeploy them.
const STATIC_ASSET_PATTERNS = [/^\/_next\/static\//, /^\/icons\//, /^\/favicon/];

function isStaticAsset(url) {
  return STATIC_ASSET_PATTERNS.some((re) => re.test(url.pathname));
}

self.addEventListener("install", () => {
  // Deliberately no self.skipWaiting() here - a newly-installed worker
  // should sit in the "waiting" state until the person actually acts on
  // the update prompt (see ServiceWorkerRegister.tsx), not silently
  // take over a tab mid-workout. Only the SKIP_WAITING message below
  // triggers it.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    // Cache-first.
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Network-first for page navigations - this app's pages are per-user,
  // server-rendered, and frequently changing (workout logs, feed posts,
  // program progress), so a cached page would very often just be wrong.
  // The cache here only exists as a fallback for a genuinely dropped
  // connection (e.g. gym wifi flaking mid-session), not as a first
  // choice. API/action requests are left alone entirely - never served
  // from cache, always hit the network so writes and fresh reads behave
  // exactly as they would without a service worker at all.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
