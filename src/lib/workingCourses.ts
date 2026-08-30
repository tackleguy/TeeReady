/**
 * Courses with a complete local hole pack (map-ready offline layouts).
 */

import type { GolfCourseSummary } from './golf';
import type { HolePackManifestEntry } from './golfHolePacks';

const MI_MATCH = 0.85;

export function haversineMi(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

export function courseMatchesHolePackEntry(
  course: GolfCourseSummary,
  entry: HolePackManifestEntry,
): boolean {
  if (entry.name.toLowerCase() === course.name.toLowerCase()) return true;
  if (
    !Number.isFinite(course.lat) ||
    !Number.isFinite(course.lon) ||
    !Number.isFinite(entry.lat) ||
    !Number.isFinite(entry.lon)
  ) {
    return false;
  }
  return haversineMi(course.lat, course.lon, entry.lat, entry.lon) < MI_MATCH;
}

export function filterToWorkingCourses(
  courses: GolfCourseSummary[],
  entries: HolePackManifestEntry[],
): GolfCourseSummary[] {
  if (!entries.length) return [];
  return courses.filter((c) =>
    entries.some((e) => courseMatchesHolePackEntry(c, e)),
  );
}

export function holePackEntryToSummary(
  entry: HolePackManifestEntry,
  from?: { lat: number; lon: number },
): GolfCourseSummary {
  return {
    id: `holepack:${entry.slug}`,
    osmType: 'node',
    osmId: 0,
    name: entry.name,
    lat: entry.lat,
    lon: entry.lon,
    holes: entry.holes,
    distanceMi:
      from != null
        ? Math.round(
            haversineMi(from.lat, from.lon, entry.lat, entry.lon) * 10,
          ) / 10
        : undefined,
  };
}

export function searchWorkingManifest(
  entries: HolePackManifestEntry[],
  query: string,
  lat: number,
  lon: number,
  limit = 40,
): GolfCourseSummary[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = entries.filter((e) => e.name.toLowerCase().includes(q));
  hits.sort(
    (a, b) =>
      haversineMi(lat, lon, a.lat, a.lon) -
      haversineMi(lat, lon, b.lat, b.lon),
  );
  return hits.slice(0, limit).map((e) => holePackEntryToSummary(e, { lat, lon }));
}

export function nearbyWorkingManifest(
  entries: HolePackManifestEntry[],
  lat: number,
  lon: number,
  limit = 48,
): GolfCourseSummary[] {
  const sorted = [...entries]
    .filter((e) => e.holes === 9 || e.holes === 18)
    .sort(
      (a, b) =>
        haversineMi(lat, lon, a.lat, a.lon) -
        haversineMi(lat, lon, b.lat, b.lon),
    );
  return sorted
    .slice(0, limit)
    .map((e) => holePackEntryToSummary(e, { lat, lon }));
}

/** API nearby/search merged with static hole-pack manifest. */
export function mergeWorkingCourses(
  apiCourses: GolfCourseSummary[],
  entries: HolePackManifestEntry[],
  lat: number,
  lon: number,
  query: string,
): GolfCourseSummary[] {
  if (!entries.length) return [];
  const q = query.trim();
  if (q.length >= 2) {
    const manifest = searchWorkingManifest(entries, q, lat, lon);
    const seen = new Set(manifest.map((c) => c.id));
    for (const c of filterToWorkingCourses(apiCourses, entries)) {
      if (!seen.has(c.id)) manifest.push(c);
    }
    return manifest;
  }
  const fromApi = filterToWorkingCourses(apiCourses, entries);
  if (fromApi.length >= 5) return fromApi;
  return nearbyWorkingManifest(entries, lat, lon, 48);
}
