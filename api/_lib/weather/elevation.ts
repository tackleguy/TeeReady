/**
 * USGS Elevation Point Query Service — US terrain only.
 * Cache permanently: ground height does not change between rounds.
 */

const ELEV_CACHE = new Map<string, number | null>();

function isUsRough(lat: number, lon: number): boolean {
  if (lat >= 24.5 && lat <= 49.5 && lon >= -125 && lon <= -66.5) return true;
  if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129) return true;
  if (lat >= 18.5 && lat <= 22.5 && lon >= -161 && lon <= -154) return true;
  if (lat >= 17.5 && lat <= 18.6 && lon >= -67.5 && lon <= -64.5) return true;
  return false;
}

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

async function fetchOne(lat: number, lon: number): Promise<number | null> {
  const key = cacheKey(lat, lon);
  if (ELEV_CACHE.has(key)) return ELEV_CACHE.get(key)!;
  if (!isUsRough(lat, lon)) {
    ELEV_CACHE.set(key, null);
    return null;
  }
  try {
    const url =
      `https://epqs.nationalmap.gov/v1/json?x=${encodeURIComponent(String(lon))}` +
      `&y=${encodeURIComponent(String(lat))}&wkid=4326&units=Meters`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 1_500);
    try {
      const res = await fetch(url, { signal: ac.signal });
      if (!res.ok) {
        ELEV_CACHE.set(key, null);
        return null;
      }
      const body = (await res.json()) as { value?: string | number | null };
      const raw = body.value;
      const n =
        typeof raw === 'number'
          ? raw
          : typeof raw === 'string'
            ? Number(raw)
            : NaN;
      const meters = Number.isFinite(n) ? n : null;
      ELEV_CACHE.set(key, meters);
      return meters;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    ELEV_CACHE.set(key, null);
    return null;
  }
}

/** Batch elevation lookups with limited concurrency. */
export async function elevationMeters(
  points: Array<{ lat: number; lon: number }>,
  concurrency = 4,
): Promise<Array<number | null>> {
  const out: Array<number | null> = new Array(points.length).fill(null);
  let cursor = 0;
  async function worker() {
    while (cursor < points.length) {
      const i = cursor;
      cursor += 1;
      const p = points[i]!;
      out[i] = await fetchOne(p.lat, p.lon);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, points.length) }, () =>
      worker(),
    ),
  );
  return out;
}

export async function elevationMeter(
  lat: number,
  lon: number,
): Promise<number | null> {
  return (await elevationMeters([{ lat, lon }]))[0] ?? null;
}
