/**
 * Courses with a complete local hole pack (map-ready offline layouts).
 */

import type { GolfCourseSummary } from './golf';
import type { HolePackManifestEntry } from './golfHolePacks';
import {
  filterNameMatches,
  namesConflict,
  namesLooselyMatch,
} from '../../api/golf/_lib/courseRelate';
import { geodesicMiles } from './geodesic';

export function haversineMi(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return geodesicMiles(aLat, aLon, bLat, bLon);
}

export function courseMatchesHolePackEntry(
  course: GolfCourseSummary,
  entry: HolePackManifestEntry,
): boolean {
  if (entry.name.toLowerCase() === course.name.toLowerCase()) return true;
  if (namesConflict(course.name, entry.name)) return false;
  if (namesLooselyMatch(course.name, entry.name)) return true;
  return false;
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
  limit = 80,
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

/** Prefer live API rows (OSM ids, region, photos) when they match a pack entry. */
export function preferApiSummaries(
  manifestCourses: GolfCourseSummary[],
  apiCourses: GolfCourseSummary[],
  entries: HolePackManifestEntry[],
): GolfCourseSummary[] {
  return manifestCourses.map((manifest) => {
    const slug = manifest.id.startsWith('holepack:')
      ? manifest.id.slice('holepack:'.length)
      : '';
    const entry =
      entries.find((e) => e.slug === slug) ??
      entries.find(
        (e) => e.name.toLowerCase() === manifest.name.toLowerCase(),
      );
    if (!entry) return manifest;
    const named = filterNameMatches(apiCourses, entry.name);
    const api =
      named.find((c) => !namesConflict(c.name, entry.name)) ??
      (named.length === 1 ? named[0] : undefined);
    if (!api) return manifest;
    return {
      ...api,
      holes: api.holes ?? manifest.holes,
      distanceMi: manifest.distanceMi ?? api.distanceMi,
    };
  });
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
    const merged = [...manifest];
    for (const c of filterToWorkingCourses(apiCourses, entries)) {
      if (!seen.has(c.id)) merged.push(c);
    }
    return preferApiSummaries(merged, apiCourses, entries);
  }
  const nearby = nearbyWorkingManifest(entries, lat, lon, entries.length);
  return preferApiSummaries(nearby, apiCourses, entries);
}
