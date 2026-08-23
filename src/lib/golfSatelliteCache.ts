/** Durable Esri satellite tile warm-cache so course maps open instantly. */

const ESRI_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

const SATELLITE_WARM_TTL_MS = 30 * 24 * 60 * 60_000;
const SATELLITE_WARM_MAX = 40;
const LS_PREFIX = 'teeready-golf-cache:';
const WARM_INDEX_KEY = 'golf:v1:satellite-warm-index';
const CACHE_NAME = 'teeready-satellite-v1';

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

export function satelliteTileUrl(z: number, x: number, y: number): string {
  return ESRI_TILE.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/** Tile URLs around a course center — matches GolfMap default zoom ~15–16. */
export function satelliteTilesForCourse(
  lat: number,
  lon: number,
  zooms: number[] = [15, 16],
): string[] {
  const urls = new Set<string>();
  for (const z of zooms) {
    const [cx, cy] = lonLatToTileXY(lon, lat, z);
    const radius = z >= 16 ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        urls.add(satelliteTileUrl(z, cx + dx, cy + dy));
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

async function putTileInCache(url: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return;
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) await cache.put(url, res.clone());
  } catch {
    // Best-effort — service worker may still cache on retry.
    try {
      await fetch(url, { mode: 'no-cors' });
    } catch {
      // ignore
    }
  }
}

/** Idle-prefetch satellite imagery for a course (also backs up for offline). */
export function warmSatelliteTiles(
  lat: number,
  lon: number,
  opts?: { courseId?: string; zooms?: number[] },
): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const key = satelliteWarmKey(lat, lon, opts?.courseId);
  if (peekSatelliteTilesWarm(lat, lon, opts?.courseId)) return;
  if (warmInFlight.has(key)) return;
  warmInFlight.add(key);

  const urls = satelliteTilesForCourse(lat, lon, opts?.zooms);

  const run = async () => {
    try {
      // Stagger fetches so we don't spike the network on course-list warm.
      for (let i = 0; i < urls.length; i += 1) {
        await putTileInCache(urls[i]!);
        if (i % 4 === 3) await new Promise((r) => window.setTimeout(r, 40));
      }
      markSatelliteWarm(key);
    } finally {
      warmInFlight.delete(key);
    }
  };

  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(() => void run(), { timeout: 5000 });
  } else {
    window.setTimeout(() => void run(), 800);
  }
}
