/** Static hole-geometry packs — durable OSM backups shipped under /golf/holes. */

import type { GolfHole } from './golf';
import {
  filterNameMatches,
  namesConflict,
} from '../../api/golf/_lib/courseRelate';

function holesBaseUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>)
    .VITE_HOLES_BASE_URL;
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || '/golf/holes';
}

export interface HolePackManifestEntry {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holes: number;
  holeNumbers?: number[];
  provenance?: string;
  hasScorecard?: boolean;
  builtAt?: string;
}

export interface HolePackManifest {
  version: number;
  builtAt?: string;
  count: number;
  courses: HolePackManifestEntry[];
}

export interface HolePack {
  version?: number;
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holes: GolfHole[];
  count?: number;
  provenance?: string;
  hasScorecard?: boolean;
  source?: string;
  attribution?: string;
  builtAt?: string;
}

/** Legacy name matchers shared with curated green packs. */
const SLUGS: Array<{ slug: string; test: (name: string) => boolean }> = [
  {
    slug: 'augusta-national-golf-club',
    test: (n) =>
      n.includes('augusta national') && !n.includes('par 3') && !n.includes('par-3'),
  },
  {
    slug: 'torrey-pines-south',
    test: (n) =>
      n.includes('south at torrey') ||
      (n.includes('torrey pines') && n.includes('south')),
  },
  {
    slug: 'torrey-pines-north',
    test: (n) =>
      n.includes('north at torrey') ||
      (n.includes('torrey pines') && n.includes('north')),
  },
  {
    slug: 'pebble-beach-golf-links',
    test: (n) =>
      n.includes('pebble beach golf links') ||
      (n.includes('pebble beach') &&
        !n.includes('creek') &&
        !n.includes('cimarron')),
  },
  {
    slug: 'spyglass-hill-golf-course',
    test: (n) => n.includes('spyglass hill'),
  },
  {
    slug: 'black-at-bethpage-state-park-golf-course',
    test: (n) => n.includes('bethpage') && n.includes('black'),
  },
  {
    slug: 'pinehurst-resort-country-club-no-2',
    test: (n) =>
      n.includes('pinehurst') &&
      (n.includes('no 2') || n.includes('no. 2') || n.includes('#2') || n.includes(' number 2')),
  },
  {
    slug: 'tpc-sawgrass-the-players-stadium-course',
    test: (n) =>
      (n.includes('sawgrass') && n.includes('stadium')) ||
      (n.includes('tpc sawgrass') && n.includes('players')),
  },
];

/**
 * Pure lat/lon match without a name hit. Adjacent municipal 18s are often
 * 200–800 m apart, so this must stay well under that.
 */
const MATCH_COORD_M = 250;

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

let manifestPromise: Promise<HolePackManifest | null> | null = null;
const packCache = new Map<string, Promise<HolePack | null>>();

export function loadHolePackManifest(): Promise<HolePackManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(`${holesBaseUrl()}/manifest.json`, {
    cache: 'no-store',
  })
    .then((res) => (res.ok ? (res.json() as Promise<HolePackManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

function matchSlugLegacy(courseName: string | undefined | null): string | null {
  if (!courseName) return null;
  const n = courseName.toLowerCase();
  for (const { slug, test } of SLUGS) {
    if (test(n)) return slug;
  }
  return null;
}

function matchSlugFromManifest(
  manifest: HolePackManifest | null,
  courseName: string | null | undefined,
  lat?: number | null,
  lon?: number | null,
): string | null {
  if (!manifest?.courses?.length) return null;

  if (courseName) {
    const named = filterNameMatches(manifest.courses, courseName);
    if (named.length === 1) return named[0]!.slug;
    if (named.length > 1) {
      const unique = named.filter((c) => !namesConflict(courseName, c.name));
      const pool = unique.length ? unique : named;
      if (lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon)) {
        let best: HolePackManifestEntry | null = null;
        let bestD = Infinity;
        for (const c of pool) {
          const d = haversineM(lat, lon, c.lat, c.lon);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (best) return best.slug;
      }
      return pool[0]!.slug;
    }
  }

  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  // Last resort: unique nearest pack, and only if nothing else is similarly close.
  const ranked = manifest.courses
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .map((c) => ({ c, d: haversineM(lat, lon, c.lat, c.lon) }))
    .filter((x) => x.d <= MATCH_COORD_M)
    .sort((a, b) => a.d - b.d);
  if (!ranked.length) return null;
  if (ranked.length >= 2 && ranked[1]!.d - ranked[0]!.d < 80) return null;
  return ranked[0]!.c.slug;
}

export async function resolveHolePackSlug(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<string | null> {
  const manifest = await loadHolePackManifest();
  return (
    matchSlugFromManifest(manifest, courseName, lat, lon) ??
    matchSlugLegacy(courseName)
  );
}

export function loadHolePack(slug: string): Promise<HolePack | null> {
  const hit = packCache.get(slug);
  if (hit) return hit;
  const pending = fetch(`${holesBaseUrl()}/${slug}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<HolePack>) : null))
    .catch(() => null);
  packCache.set(slug, pending);
  return pending;
}

/** Resolve + load a static hole pack (used as OSM outage / first-open backup). */
export async function resolveHolePack(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<HolePack | null> {
  const slug = await resolveHolePackSlug(courseName, lat, lon);
  if (!slug) return null;
  const pack = await loadHolePack(slug);
  if (!pack?.holes?.length) return null;
  return pack;
}

/** True when a static hole pack exists for this course (map lines without OSM). */
export async function courseHasHolePack(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<boolean> {
  const slug = await resolveHolePackSlug(courseName, lat, lon);
  return slug != null;
}

export function prefetchHolePackManifest(): void {
  void loadHolePackManifest();
}

/** Warm a hole pack into the HTTP/SW cache without blocking map open. */
export async function resolveAndWarmHolePack(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<void> {
  const slug = await resolveHolePackSlug(courseName, lat, lon);
  if (!slug) return;
  await loadHolePack(slug);
}
