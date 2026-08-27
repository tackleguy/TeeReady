/**
 * Durable OSM backups under /golf/osm (raw map elements) and /golf/holes
 * (derived hole geometry). Used when live OSM / Overpass is down.
 *
 * Edge-safe: loads via same-origin fetch of public/ assets (no filesystem).
 */

import type { OsmElement } from './overpass';

const MATCH_M = 1_400;

export type OsmBackupManifestEntry = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  elementCount?: number;
  holes?: number;
};

export type OsmBackupManifest = {
  version: number;
  builtAt?: string;
  count: number;
  courses: OsmBackupManifestEntry[];
};

export type OsmMapBackup = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  bbox?: { south: number; west: number; north: number; east: number };
  fetchedAt?: string;
  source?: string;
  elements: OsmElement[];
};

export type HolePackBackup = {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holes: Array<{
    number: number;
    yards: number;
    bearingDeg: number;
    tee: { lat: number; lon: number };
    green: { lat: number; lon: number };
    source?: string;
    name?: string;
    par?: number;
    path?: Array<{ lat: number; lon: number }>;
    loop?: string;
    provenance?: string;
    [key: string]: unknown;
  }>;
};

function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

function backupOrigin(req: Request): string {
  const envBase = process.env.OSM_BACKUP_BASE_URL?.trim().replace(/\/+$/, '');
  if (envBase) return envBase;
  try {
    return new URL(req.url).origin;
  } catch {
    return 'https://tee-ready.vercel.app';
  }
}

async function fetchJson<T>(url: string, timeoutMs = 2_500): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function matchSlug(
  courses: OsmBackupManifestEntry[],
  opts: { lat: number; lon: number; courseName?: string; matchM?: number },
): string | null {
  const matchM = opts.matchM ?? MATCH_M;
  const name = opts.courseName?.trim().toLowerCase();
  if (name) {
    const exact = courses.find((c) => c.name.toLowerCase() === name);
    if (exact) return exact.slug;
    const partial = courses.find(
      (c) =>
        name.includes(c.name.toLowerCase()) ||
        c.name.toLowerCase().includes(name),
    );
    if (partial) return partial.slug;
  }

  let best: OsmBackupManifestEntry | null = null;
  let bestD = Infinity;
  for (const c of courses) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const d = haversineM(opts.lat, opts.lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= matchM ? best.slug : null;
}

const manifestCache = new Map<
  string,
  { at: number; data: OsmBackupManifest | null }
>();
const MANIFEST_TTL_MS = 10 * 60_000;

async function loadManifest(
  origin: string,
  kind: 'osm' | 'holes',
): Promise<OsmBackupManifest | null> {
  const key = `${origin}:${kind}`;
  const hit = manifestCache.get(key);
  if (hit && Date.now() - hit.at < MANIFEST_TTL_MS) return hit.data;
  const path = kind === 'osm' ? '/golf/osm/manifest.json' : '/golf/holes/manifest.json';
  const data = await fetchJson<OsmBackupManifest>(`${origin}${path}`, 2_000);
  manifestCache.set(key, { at: Date.now(), data });
  return data;
}

/** Raw reconstructed golf OSM elements for a course near lat/lon. */
export async function loadOsmMapBackup(
  req: Request,
  opts: { lat: number; lon: number; courseName?: string },
): Promise<OsmMapBackup | null> {
  const origin = backupOrigin(req);
  const manifest = await loadManifest(origin, 'osm');
  if (!manifest?.courses?.length) return null;
  const slug = matchSlug(manifest.courses, opts);
  if (!slug) return null;
  const pack = await fetchJson<OsmMapBackup>(
    `${origin}/golf/osm/${slug}.json`,
    4_000,
  );
  if (!pack?.elements?.length) return null;
  return pack;
}

/** Derived hole geometry pack — last-resort API response when OSM is down. */
export async function loadHolePackBackup(
  req: Request,
  opts: { lat: number; lon: number; courseName?: string },
): Promise<HolePackBackup | null> {
  const origin = backupOrigin(req);
  const manifest = await loadManifest(origin, 'holes');
  if (!manifest?.courses?.length) return null;
  const slug = matchSlug(manifest.courses, opts);
  if (!slug) return null;
  const pack = await fetchJson<HolePackBackup>(
    `${origin}/golf/holes/${slug}.json`,
    4_000,
  );
  if (!pack?.holes?.length) return null;
  return pack;
}
