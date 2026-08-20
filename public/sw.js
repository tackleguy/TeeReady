// Tiny stale-while-revalidate service worker. We cache:
//   • hashed Vite assets (immutable) — cache-first,
//   • /api/* responses with a 5-minute SWR window so a slow network or
//     brief offline still surfaces last-known weather,
//   • HTML navigations — network-first so deploys aren't stuck behind
//     a cached index.html that points at deleted hashed bundles.
//
// This is intentionally simple — no Workbox dependency, no precache
// manifest. Vite's hashed asset filenames give us cache-busting for free.

const VERSION = 'weatherstop-v19';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const APP_SHELL = ['/manifest.webmanifest', '/icon.svg'];

// How long a cached /api response may be served before we wait for the
// network instead. Previously there was no age check at all, so a cached
// body was returned forever.
const API_MAX_AGE_MS = 5 * 60 * 1000;
const CACHED_AT_HEADER = 'x-sw-cached-at';

// Radar imagery is georeferenced per bbox (or per tile) and runs to
// megabytes a frame, so the cache would grow without ever being hit.
// These already carry their own Cache-Control, so leave them to the HTTP
// cache and keep the service worker out of the image path entirely.
const BYPASS_CACHE = /^\/api\/(?:radar\/|weather\/(?:grid|field|wind-grid))/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // External weather sources (open-meteo, weather.gov, realearth, etc.)
    // are short-cached so swiping back to a recent city is instant.
    if (
      /(?:open-meteo|weather\.gov|realearth\.ssec\.wisc|tidesandcurrents)/i.test(
        url.host,
      )
    ) {
      event.respondWith(staleWhileRevalidate(req));
    }
    return;
  }

  // Never cache-first the document shell — stale HTML + new asset hashes
  // = blank white screen after every deploy.
  const isDocument =
    req.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isDocument) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Hashed assets + icons — cache-first.
  if (/\.(?:js|css|svg|webmanifest|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // API or weather data — stale-while-revalidate.
  if (BYPASS_CACHE.test(url.pathname)) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    // Do not put HTML in STATIC_CACHE — keeps deploys honest.
    return fresh;
  } catch (err) {
    const fallback =
      (await caches.match(request)) ||
      (await caches.match('/index.html')) ||
      (await caches.match('/'));
    if (fallback) return fallback;
    throw err;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const fallback = await caches.match(request);
    if (fallback) return fallback;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const networked = fetch(request)
    .then(async (response) => {
      if (response && response.status === 200 && response.type !== 'opaque') {
        await putStamped(cache, request, response);
      }
      return response;
    })
    .catch(() => undefined);

  // Serve a fresh-enough copy immediately and let the refetch land in the
  // background; otherwise wait for the network and only fall back to a
  // stale body if it fails.
  if (cached && ageOf(cached) < API_MAX_AGE_MS) {
    networked.catch(() => undefined);
    return cached;
  }

  const response = await networked;
  if (response) return response;
  // `cached ?? networked` used to return the pending promise here, which
  // resolves to undefined on a failed fetch and makes respondWith throw
  // instead of surfacing the offline response.
  return cached ?? new Response('offline', { status: 503 });
}

function ageOf(response) {
  const stamped = Number(response.headers.get(CACHED_AT_HEADER));
  if (Number.isFinite(stamped) && stamped > 0) return Date.now() - stamped;
  const date = Date.parse(response.headers.get('date') ?? '');
  if (Number.isFinite(date)) return Date.now() - date;
  return Number.POSITIVE_INFINITY;
}

async function putStamped(cache, request, response) {
  const body = await response.clone().arrayBuffer();
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, String(Date.now()));
  await cache.put(
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}
