/** Durable Esri satellite tile warm-cache so course maps open instantly. */

const ESRI_HOSTS: string[] = [
  'https://server.arcgisonline.com',
  'https://services.arcgisonline.com',
];

const ESRI_PATH =
  '/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Must match public/sw.js SATELLITE_CACHE so MapLibre hits warm tiles. */
export const SATELLITE_CACHE_NAME = 'weatherstop-v23-satellite';
const LEGACY_CACHE_NAMES = ['teeready-satellite-v1', 'weatherstop-v22-satellite'];

const SATELLITE_WARM_TTL_MS = 30 * 24 * 60 * 60_000;
const SATELLITE_WARM_MAX = 48;
const LS_PREFIX = 'teeready-golf-cache:';
const WARM_INDEX_KEY = 'golf:v1:satellite-warm-index';

const warmInFlight = new Set<string>();

function q3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function satelliteWarmKey(
  lat: number,
  lon: number,
  courseId?: string,
): string {
  if (courseId) return `golf:v1:satellite-warm:id:${courseId}`;
  return `golf:v1:satellite-warm:geo:${q3(lat)}:${q3(lon)}`;
}

function lonLatToTileXY(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  );
  return [x, y];
}

export function satelliteTileUrl(
  z: number,
  x: number,
  y: number,
  host: string = ESRI_HOSTS[0],
): string {
  return `${host}${ESRI_PATH}`
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** Tile URLs around a course — covers overview through green close-up. */
export function satelliteTilesForCourse(
  lat: number,
  lon: number,
  zooms: number[] = [14, 15, 16, 17, 18],
): string[] {
  const urls = new Set<string>();
  for (const z of zooms) {
    const [cx, cy] = lonLatToTileXY(lon, lat, z);
    // Wider pad at overview; tighter at close-up (still enough for hole framing).
    const radius = z <= 14 ? 2 : z <= 16 ? 2 : z === 17 ? 2 : 1;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        // Alternate Esri hosts so MapLibre + browser open more sockets in parallel.
        const host = ESRI_HOSTS[(cx + dx + cy + dy + z) % ESRI_HOSTS.length]!;
        urls.add(satelliteTileUrl(z, cx + dx, cy + dy, host));
      }
    }
  }
  return [...urls];
}

function readWarmIndex(): string[] {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${WARM_INDEX_KEY}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeWarmIndex(keys: string[]): void {
  try {
    localStorage.setItem(`${LS_PREFIX}${WARM_INDEX_KEY}`, JSON.stringify(keys));
  } catch {
    // quota / private mode
  }
}

function touchWarmIndex(key: string): void {
  const next = readWarmIndex().filter((k) => k !== key);
  next.push(key);
  while (next.length > SATELLITE_WARM_MAX) {
    const oldest = next.shift();
    if (oldest) {
      try {
        localStorage.removeItem(`${LS_PREFIX}${oldest}`);
      } catch {
        // ignore
      }
    }
  }
  writeWarmIndex(next);
}

function markSatelliteWarm(key: string): void {
  try {
    localStorage.setItem(
      `${LS_PREFIX}${key}`,
      JSON.stringify({ at: Date.now() }),
    );
    touchWarmIndex(key);
  } catch {
    // quota / private mode
  }
}

/** True when we've prefetched satellite tiles for this course recently. */
export function peekSatelliteTilesWarm(
  lat: number,
  lon: number,
  courseId?: string,
): boolean {
  if (typeof window === 'undefined') return false;
  const key = satelliteWarmKey(lat, lon, courseId);
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { at?: number };
    if (!parsed?.at) return false;
    return Date.now() - parsed.at <= SATELLITE_WARM_TTL_MS;
  } catch {
    return false;
  }
}

async function openSatelliteCaches(): Promise<Cache[]> {
  if (typeof caches === 'undefined') return [];
  const opened: Cache[] = [];
  try {
    opened.push(await caches.open(SATELLITE_CACHE_NAME));
  } catch {
    return [];
  }
  // One-time bridge: copy hits from older cache names into the active SW cache.
  for (const name of LEGACY_CACHE_NAMES) {
    try {
      if (!(await caches.has(name))) continue;
      const legacy = await caches.open(name);
      opened.push(legacy);
    } catch {
      // ignore
    }
  }
  return opened;
}

async function putTileInCache(url: string): Promise<void> {
  if (typeof caches === 'undefined') {
    try {
      await fetch(url, { mode: 'cors', credentials: 'omit', priority: 'high' } as RequestInit);
    } catch {
      // ignore
    }
    return;
  }
  try {
    const cachesOpen = await openSatelliteCaches();
    const primary = cachesOpen[0];
    if (!primary) return;
    for (const cache of cachesOpen) {
      const hit = await cache.match(url);
      if (hit) {
        if (cache !== primary) await primary.put(url, hit.clone());
        return;
      }
    }
    const res = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      // Chromium: prefer satellite tiles over background work.
      priority: 'high',
    } as RequestInit);
    if (res.ok) await primary.put(url, res.clone());
  } catch {
    try {
      await fetch(url, { mode: 'no-cors' });
    } catch {
      // ignore
    }
  }
}

async function runPool(urls: string[], concurrency: number): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (i < urls.length) {
      const url = urls[i]!;
      i += 1;
      await putTileInCache(url);
    }
  });
  await Promise.all(workers);
}

export type WarmSatelliteOpts = {
  courseId?: string;
  zooms?: number[];
  /** Immediate parallel fetch — use when the user just opened a course. */
  priority?: 'high' | 'low';
};

/** Prefetch satellite imagery for a course (Cache API + SW share the same store). */
export function warmSatelliteTiles(
  lat: number,
  lon: number,
  opts?: WarmSatelliteOpts,
): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const high = opts?.priority === 'high';
  const key = satelliteWarmKey(lat, lon, opts?.courseId);
  if (!high && peekSatelliteTilesWarm(lat, lon, opts?.courseId)) return;
  if (warmInFlight.has(key)) return;
  warmInFlight.add(key);

  const urls = satelliteTilesForCourse(lat, lon, opts?.zooms);
  // High priority: overview + mid first so the first map paint fills faster.
  const ordered = high
    ? [
        ...satelliteTilesForCourse(lat, lon, [15, 16]),
        ...urls.filter((u) => !/\/tile\/1[56]\//.test(u)),
      ]
    : urls;
  const unique = [...new Set(ordered)];

  const run = async () => {
    try {
      await runPool(unique, high ? 10 : 4);
      markSatelliteWarm(key);
    } finally {
      warmInFlight.delete(key);
    }
  };

  if (high) {
    void run();
    return;
  }

  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(() => void run(), { timeout: 2500 });
  } else {
    window.setTimeout(() => void run(), 200);
  }
}
