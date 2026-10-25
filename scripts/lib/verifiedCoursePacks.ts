/** Conservative, offline-only import of reviewed OSM snapshots. No inferred holes or tees. */
import { createHash } from 'node:crypto';
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveHolesFromOsmElements } from '../../api/golf/holes';
import { inspectCourseLocation, inspectHoleGeo, inspectLayoutGeo } from '../../src/lib/geoAccuracy';
import { geodesicYards } from '../../src/lib/geodesic';

type Point = { lat: number; lon: number };
type Element = { type: string; id: number; tags?: Record<string, string>; geometry?: Point[] };
export type Backup = { slug: string; name: string; lat: number; lon: number; fetchedAt: string; elements: Element[] };
export type BatchEntry = { slug: string; osmCourseId: number; sourceSha256: string };
export type Batch = { id: string; reviewedAt: string; courses: BatchEntry[] };
const normalize = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const samePoint = (a: Point, b: Point) => a.lat === b.lat && a.lon === b.lon;
const validPoint = (p: Point) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const ring = (e: Element) => e.type === 'way' && (e.geometry?.length ?? 0) >= 4 && e.geometry!.every(validPoint) && samePoint(e.geometry![0]!, e.geometry!.at(-1)!);
function requireData(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}

/** Include points on polygon edges; never snap or move a source coordinate. */
export function pointInRing(p: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const cross = (p.lon - a.lon) * (b.lat - a.lat) - (p.lat - a.lat) * (b.lon - a.lon);
    if (Math.abs(cross) < 1e-13 && p.lon >= Math.min(a.lon, b.lon) - 1e-10 && p.lon <= Math.max(a.lon, b.lon) + 1e-10 && p.lat >= Math.min(a.lat, b.lat) - 1e-10 && p.lat <= Math.max(a.lat, b.lat) + 1e-10) return true;
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < (b.lon - a.lon) * (p.lat - a.lat) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.lon - p.lon) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lon - p.lon);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

function intersects(path: Point[], polygon: Point[]): boolean {
  return path.some(p => pointInRing(p, polygon)) || path.slice(1).some((b, i) => polygon.slice(1).some((d, j) => segmentsCross(path[i]!, b, polygon[j]!, d)));
}

const surface = (e: Element) => ({ osmWayId: e.id, ring: e.geometry! });

export function buildVerifiedPack(backup: Backup, entry: BatchEntry, batch: Pick<Batch, 'id' | 'reviewedAt'>) {
  requireData(backup.slug === entry.slug && /^[a-z0-9-]+$/.test(entry.slug), 'invalid or mismatched slug');
  requireData(validPoint(backup) && Number.isFinite(Date.parse(backup.fetchedAt)), 'invalid pin or source date');
  const boundaries = backup.elements.filter(e => e.tags?.leisure === 'golf_course' && ring(e) && normalize(e.tags.name ?? '') === normalize(backup.name));
  requireData(boundaries.length === 1 && boundaries[0]!.id === entry.osmCourseId, 'ambiguous course identity');
  const boundary = boundaries[0]!;
  requireData(normalize(backup.name).length >= 5 && !/^\d+$/.test(backup.name), 'invalid course name');
  requireData(pointInRing(backup, boundary.geometry!), 'course pin outside named boundary');
  const ways = backup.elements.filter(e => e.tags?.golf === 'hole');
  requireData(ways.length === 9 || ways.length === 18, 'incomplete or multiple layouts');
  ways.sort((a, b) => Number(a.tags!.ref) - Number(b.tags!.ref));
  requireData(ways.every((e, i) => e.type === 'way' && e.tags!.ref === String(i + 1)), 'duplicate, missing, or ambiguous hole numbers');
  const declaredCount = boundary.tags!['golf:course']?.match(/^(\d+)_hole$/)?.[1] ?? boundary.tags!['golf:holes'] ?? boundary.tags!.holes;
  requireData(!declaredCount || Number(declaredCount) === ways.length, 'source declares a different hole count');
  requireData(declaredCount || ways.length === 18, 'nine-hole layout lacks an explicit course hole count');
  requireData(ways.every(e => e.geometry && e.geometry.length >= 2 && e.geometry.every(p => validPoint(p) && pointInRing(p, boundary.geometry!))), 'hole outside named boundary');
  requireData(ways.every(e => /^[3-6]$/.test(e.tags!.par ?? '')), 'missing or invalid sourced par');
  const declaredPar = boundary.tags!['golf:par'];
  requireData(!declaredPar || /^\d+$/.test(declaredPar) && Number(declaredPar) === ways.reduce((n, e) => n + Number(e.tags!.par), 0), 'source par total conflicts with layout');
  requireData(ways.every(e => !e.tags!.course && !e.tags!['golf:course'] && !e.tags!.loop), 'named hole loops require separate review');
  const polygons = backup.elements.filter(e => ring(e) && ['tee', 'green', 'fairway'].includes(e.tags?.golf ?? '') && e.geometry!.every(p => pointInRing(p, boundary.geometry!)));
  const greens = polygons.filter(e => e.tags!.golf === 'green');
  requireData(greens.length <= ways.length + 3, 'extra greens suggest an unresolved sibling layout');
  // The existing derivation pipeline calculates distance/bearing. Restrict its
  // input to reviewed numbered ways: no nearest-tee pairing or name-based card merge.
  const derived = deriveHolesFromOsmElements(ways);
  requireData(derived.length === ways.length, 'derivation dropped or changed source holes');
  const usedGreens = new Set<number>();
  const holes = ways.map(way => {
    const number = Number(way.tags!.ref), path = way.geometry!;
    const h = derived.find(hole => hole.number === number);
    requireData(h && samePoint(h.tee, path[0]!) && samePoint(h.green, path.at(-1)!), `hole ${number}: derivation changed source endpoints`);
    const match = (kind: string, point: Point) => polygons.filter(e => e.tags!.golf === kind && (!e.tags!.ref || e.tags!.ref === String(number)) && pointInRing(point, e.geometry!));
    const tees = match('tee', path[0]!), greens = match('green', path.at(-1)!);
    requireData(tees.length === 1 && greens.length === 1, `hole ${number}: missing or ambiguous tee/green polygon`);
    requireData(!usedGreens.has(greens[0]!.id), `hole ${number}: reused green requires shared-green review`);
    usedGreens.add(greens[0]!.id);
    const fairways = polygons.filter(e => e.tags!.golf === 'fairway' && (!e.tags!.ref || e.tags!.ref === String(number)) && intersects(path, e.geometry!));
    requireData(fairways.length > 0, `hole ${number}: no mapped fairway intersecting source line`);
    const hole = {
      number, ...(way.tags!.name ? { name: way.tags!.name } : {}), par: Number(way.tags!.par),
      yards: h.yards, bearingDeg: h.bearingDeg, tee: path[0]!, green: path.at(-1)!, path,
      source: 'hole-way' as const, provenance: 'geometric' as const,
      osmWayId: way.id,
      mappedSurfaces: { tee: surface(tees[0]!), green: surface(greens[0]!), fairways: fairways.map(surface) },
    };
    const geo = inspectHoleGeo(hole);
    requireData(!geo.issues.length, `hole ${number}: ${geo.issues.map(i => i.code).join(', ')}`);
    return { ...hole, geo };
  });
  const issues = [...inspectLayoutGeo(holes), ...inspectCourseLocation({ lat: backup.lat, lon: backup.lon, holes })];
  requireData(!issues.length, issues.map(i => i.code).join(', '));
  return {
    version: 1, slug: entry.slug, name: boundary.tags!.name, lat: backup.lat, lon: backup.lon,
    holes, count: holes.length, provenance: 'geometric', hasScorecard: false, source: 'osm-backup',
    attribution: '© OpenStreetMap contributors (ODbL 1.0)', builtAt: batch.reviewedAt,
    evidence: {
      batch: batch.id, osmCourseId: boundary.id, courseUrl: `https://www.openstreetmap.org/way/${boundary.id}`,
      license: 'https://opendatacommons.org/licenses/odbl/1-0/',
      sourceFile: `public/golf/osm/${entry.slug}.json`, sourceSha256: entry.sourceSha256, sourceRetrievedAt: backup.fetchedAt,
    },
    coverage: {
      numberedHoles: holes.length, mappedTees: holes.length, mappedGreens: holes.length, mappedFairways: holes.length,
      pars: 'osm-tags', yardages: 'mapped-centerline-length', officialScorecard: false, teeSpecificYardages: false,
      measuredGreenContours: false, horizontalAccuracyMeters: null,
      limitations: ['Community-mapped geometry; not a field survey.', 'Distances follow mapped hole lines, not official tee-specific scorecard yardages.', 'No measured elevation or green contours; no 3D pack supplied.'],
    },
  };
}

export function assertNoDuplicateLayout(pack: ReturnType<typeof buildVerifiedPack>, others: Array<{ slug: string; holes: Array<{ tee: Point; green: Point }> }>) {
  for (const other of others) {
    if (other.slug === pack.slug) continue;
    const overlap = pack.holes.filter(h => other.holes.some(o => o.tee && o.green && geodesicYards(h.tee.lat, h.tee.lon, o.tee.lat, o.tee.lon) < 60 && geodesicYards(h.green.lat, h.green.lon, o.green.lat, o.green.lon) < 35)).length;
    requireData(overlap < 3, `layout overlaps ${other.slug} (${overlap} holes)`);
  }
}

/** Resume only identical outputs; validate the entire batch before creating any packs. */
export function runVerifiedBatch(root: string, batch: Batch, dryRun = false) {
  requireData(batch.courses.length > 0 && batch.courses.length <= 50, 'batch must contain 1–50 courses');
  requireData(new Set(batch.courses.map(c => c.slug)).size === batch.courses.length, 'duplicate batch slug');
  requireData(new Set(batch.courses.map(c => c.osmCourseId)).size === batch.courses.length, 'duplicate course boundary');
  const manifest = JSON.parse(readFileSync(join(root, 'public/golf/holes/manifest.json'), 'utf8'));
  const packs = batch.courses.map(entry => {
    const source = readFileSync(join(root, 'public/golf/osm', `${entry.slug}.json`));
    requireData(createHash('sha256').update(source).digest('hex') === entry.sourceSha256, `${entry.slug}: source checksum changed; review again`);
    const pack = buildVerifiedPack(JSON.parse(source.toString()), entry, batch);
    requireData(!existsSync(join(root, 'public/golf/greens', `${entry.slug}.json`)), `${entry.slug}: existing mesh needs separate review`);
    const nearby = manifest.courses.filter((c: { slug: string; lat: number; lon: number }) => c.slug !== pack.slug && geodesicYards(c.lat, c.lon, pack.lat, pack.lon) < 4400)
      .map((c: { slug: string }) => JSON.parse(readFileSync(join(root, 'public/golf/holes', `${c.slug}.json`), 'utf8')));
    assertNoDuplicateLayout(pack, nearby);
    return pack;
  });
  for (const pack of packs) {
    assertNoDuplicateLayout(pack, packs);
    const path = join(root, 'public/golf/holes', `${pack.slug}.json`);
    requireData(!existsSync(path) || readFileSync(path, 'utf8') === JSON.stringify(pack), `${pack.slug}: refusing to replace an existing different pack`);
  }
  if (!dryRun) for (const pack of packs) {
    const path = join(root, 'public/golf/holes', `${pack.slug}.json`);
    if (!existsSync(path)) {
      const temporary = `${path}.tmp-${process.pid}`;
      writeFileSync(temporary, JSON.stringify(pack), { flag: 'wx' });
      try { linkSync(temporary, path); } finally { unlinkSync(temporary); }
    }
  }
  console.log(`${dryRun ? 'Validated' : 'Built/resumed'} ${packs.length} source-checked packs (${packs.reduce((n, p) => n + p.count, 0)} holes); no network requests.`);
  return packs;
}
