// Bounded, demand-driven service worker caches:
//   • hashed Vite assets (immutable) — cache-first,
//   • public weather/API responses for 5 minutes so a slow network or
//     brief offline still surfaces last-known weather,
//   • HTML navigations — network-first so deploys aren't stuck behind
//     a cached index.html that points at deleted hashed bundles.
//
// This is intentionally simple — no Workbox dependency, no precache
// manifest. Vite's hashed asset filenames give us cache-busting for free.

const VERSION = 'teeready-v29';
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const SATELLITE_CACHE = `${VERSION}-satellite`;
const COURSE_CACHE = `${VERSION}-courses`;
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
            .filter(
              (k) =>
                (k.startsWith('teeready-') || /^weatherstop-v2[23]-satellite$/.test(k)) &&
                k !== STATIC_CACHE &&
                k !== RUNTIME_CACHE &&
                k !== SATELLITE_CACHE &&
                k !== COURSE_CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.headers.has('authorization') || req.cache === 'no-store') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // Esri satellite tiles — cache-first so course maps reopen instantly.
    if (
      /(?:server|services)\.arcgisonline\.com/i.test(url.host) &&
      /World_Imagery\/MapServer\/tile/i.test(url.pathname)
    ) {
      event.respondWith(cacheFirstSatellite(req));
      return;
    }
    // External weather sources (open-meteo, weather.gov, realearth, etc.)
    // are short-cached so swiping back to a recent city is instant.
    if (
      /(?:open-meteo|weather\.gov|realearth\.ssec\.wisc|tidesandcurrents)/i.test(
        url.host,
      )
    ) {
      event.respondWith(cachedWeather(req));
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

  // Manifests change every derive — network-first so the course list never
  // sticks at an old snapshot (e.g. 1,693 after a 3,200+ pack deploy).
  if (
    url.pathname === '/golf/catalog.us.json' ||
    /\/golf\/(?:greens|holes|scorecards|osm)\/manifest\.json$/.test(
      url.pathname,
    )
  ) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Individual hole / green / scorecard / OSM packs — cache-first.
  if (
    url.pathname.startsWith('/golf/greens/') ||
    url.pathname.startsWith('/golf/holes/') ||
    url.pathname.startsWith('/golf/scorecards/') ||
    url.pathname.startsWith('/golf/osm/')
  ) {
    event.respondWith(cacheFirst(req, COURSE_CACHE, 12));
    return;
  }

  // API or weather data — reuse fresh responses without another download.
  if (BYPASS_CACHE.test(url.pathname)) return;
  if (/^\/api\/(?:geocode|golf\/(?:courses|holes|hours|ensemble|notebook))$/.test(url.pathname) || url.pathname.startsWith('/data/')) {
    event.respondWith(cachedWeather(req));
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

async function cacheFirst(request, cacheName = STATIC_CACHE, maxEntries = 80) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && canCache(fresh)) {
      const cache = await caches.open(cacheName);
      await putBounded(cache, request, fresh.clone(), maxEntries).catch(() => undefined);
    }
    return fresh;
  } catch (err) {
    const fallback = await caches.match(request);
    if (fallback) return fallback;
    throw err;
  }
}

async function cacheFirstSatellite(request) {
  const cache = await caches.open(SATELLITE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    // Opaque responses have inflated browser quota accounting and cannot be sized.
    if (fresh && canCache(fresh)) {
      await putBounded(cache, request, fresh.clone(), 96).catch(() => undefined);
    }
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function cachedWeather(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached && ageOf(cached) < API_MAX_AGE_MS) return cached;
  const networked = fetch(request)
    .then(async (response) => {
      if (response && canCache(response)) {
        await putStamped(cache, request, response).catch(() => undefined);
      } else {
        await cache.delete(request).catch(() => undefined);
      }
      return response;
    })
    .catch(() => undefined);

  const response = await networked;
  if (response) return response;
  // `cached ?? networked` used to return the pending promise here, which
  // resolves to undefined on a failed fetch and makes respondWith throw
  // instead of surfacing the offline response.
  return cached ?? new Response('offline', { status: 503 });
}

function canCache(response) {
  return response.status === 200 && response.type !== 'opaque'
    && !/(?:no-store|private|no-cache)/i.test(response.headers.get('cache-control') || '')
    && !response.headers.has('set-cookie');
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
  await putBounded(cache,
    request,
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
    40,
  );
}

// Serialize writes so simultaneous tile responses cannot outrun cache eviction.
let cacheWrites = Promise.resolve();
function putBounded(cache, request, response, maxEntries) {
  const write = cacheWrites.then(async () => {
    await cache.put(request, response);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - maxEntries))) {
      await cache.delete(key);
    }
  });
  cacheWrites = write.catch(() => undefined);
  return write;
}
