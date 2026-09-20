import data from '../data/course-directory.json';
import type { GolfCourseSummary } from './golf';
import type { HolePackManifestEntry } from './golfHolePacks';
import type { GreenMeshManifestEntry } from './golfGreen3d';
import { geodesicMiles } from './geodesic';

type Row = [string, string, number, number, number, number?];
const unpack = ([slug, name, lat, lon, holes]: Row) => ({ slug, name, lat, lon, holes });
export const directoryEntries: HolePackManifestEntry[] = (data.courses as Row[]).map(unpack);
export const directoryGreens: GreenMeshManifestEntry[] = (data.greens as Row[]).map(unpack);
const greenSlugs = new Set((data.courses as Row[]).filter(r => r[5] === 1).map(r => r[0]));
const summaries: GolfCourseSummary[] = directoryEntries.map(e => ({
  id: `holepack:${e.slug}`, osmType: 'node', osmId: 0,
  name: e.name, lat: e.lat, lon: e.lon, holes: e.holes,
}));
const ranked = new Map<string, GolfCourseSummary[]>();
export function directoryCourseHas3d(course: GolfCourseSummary): boolean {
  return greenSlugs.has(course.id.replace(/^holepack:/, ''));
}

/** Rank once per location; repeat visits and local searches reuse the same rows. */
export function directoryCourses(lat: number, lon: number, query = '', limit = 48): GolfCourseSummary[] {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const key = `${lat}:${lon}`;
  let rows = ranked.get(key);
  if (!rows) {
    rows = summaries.map(c => ({ ...c, distanceMi: geodesicMiles(lat, lon, c.lat, c.lon) }));
    rows.sort((a, b) => a.distanceMi! - b.distanceMi! || a.id.localeCompare(b.id));
    ranked.set(key, rows);
    if (ranked.size > 3) ranked.delete(ranked.keys().next().value!);
  }
  const q = query.trim().toLowerCase();
  const matches = q ? rows.filter(c => c.name.toLowerCase().includes(q)) : rows;
  return matches.slice(0, limit);
}
