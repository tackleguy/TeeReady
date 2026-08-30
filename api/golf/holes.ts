// Hole geometry (yards + bearing) from OSM golf tags.
//
// Strategy (fast → thorough):
//  1. golf=hole centerlines in the course bbox / radius
//  2. always merge golf=tee boxes onto those holes (front / mid / back)
//  3. wider radii, then OSM area(id) when the polygon is known
// Multiple ways with the same hole number become tee variants when greens
// sit near each other, or North/South (etc.) layouts when they do not.

import {
  layoutKey,
  layoutLabelFromName,
  namesConflict,
  namesLooselyMatch,
  pickPolygonForCourse,
  titleCaseName,
} from './_lib/courseRelate';
import { bearingDeg, haversineYards, pathLengthYards } from './_lib/geo';
import type { GeoAccuracyMeta } from '../../src/lib/geoAccuracy';
import { inspectHoleGeo } from '../../src/lib/geoAccuracy';
import { findScorecard, inferCardProvenance, type CourseScorecard } from './_data/scorecards';
import type { ScorecardProvenance } from './_lib/scorecardProvenance';
import { holeHasCardYardage } from './_lib/scorecardProvenance';
import {
  bboxArea,
  bboxFromLatLon,
  fetchOsmMapElements,
  holesBboxKey,
  padBbox,
  parseMapBbox,
  shrinkBbox,
  type OsmMapBbox,
} from './_lib/osmMap';
import { loadHolePackBackup } from './_lib/osmBackup';
import {
  centerOf,
  errResponse,
  jsonResponse,
  overpass,
  quantizeCoord,
  type OsmElement,
} from './_lib/overpass';
import { elevationMeters } from '../_lib/weather/elevation';
import { rateLimit, RATE } from '../_lib/rateLimit';
import { standardizeLayouts } from './_lib/standardizeHoles';

export const config = { runtime: 'edge' };

export type TeeKind = 'back' | 'mid' | 'front';

export interface GolfTeeBox {
  id: string;
  label: string;
  kind: TeeKind;
  color?: string;
  yards: number;
  bearingDeg: number;
  tee: { lat: number; lon: number };
  path?: Array<{ lat: number; lon: number }>;
  teeElevationM?: number;
}

export interface GolfHole {
  number: number;
  name?: string;
  par?: number;
  yards: number;
  /** Tee → green bearing, degrees true (0–360). */
  bearingDeg: number;
  tee: { lat: number; lon: number };
  green: { lat: number; lon: number };
  teeElevationM?: number;
  greenElevationM?: number;
  path?: Array<{ lat: number; lon: number }>;
  source: 'hole-way' | 'tee-green';
  loop?: string;
  tees?: GolfTeeBox[];
  /** Stroke index 1–18 when a scorecard provides it. */
  strokeIndex?: number;
  /** Course-level data provenance stamped onto each hole. */
  provenance?: ScorecardProvenance;
  geo?: GeoAccuracyMeta;
}

/** Process-local cache — hole geometry almost never changes. */
const HOLE_MEM = new Map<string, { at: number; holes: GolfHole[] }>();
const HOLE_MEM_TTL_MS = 6 * 60 * 60_000;

/** Mid tee + green only — extra boxes inherit the hole tee height. USGS EPQS. */
async function addElevations(holes: GolfHole[]): Promise<GolfHole[]> {
  if (!holes.length) return holes;
  const points: Array<{ lat: number; lon: number }> = [];
  holes.forEach((hole) => {
    points.push(hole.tee);
    points.push(hole.green);
  });
  try {
    // Never block map open on USGS — return bare geometry if elevation is slow.
    const elevations = await Promise.race([
      elevationMeters(points, 8),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 1_200);
      }),
    ]);
    if (!elevations) return holes;
    return holes.map((hole, index) => {
      const tee = elevations[index * 2];
      const green = elevations[index * 2 + 1];
      const teeElevationM =
        typeof tee === 'number' && Number.isFinite(tee) ? tee : undefined;
      const greenElevationM =
        typeof green === 'number' && Number.isFinite(green) ? green : undefined;
      return {
        ...hole,
        teeElevationM,
        greenElevationM,
        tees: hole.tees?.map((t) => ({ ...t, teeElevationM })),
      };
    });
  } catch {
    return holes;
  }
}

function parseRef(
  tags: Record<string, string | undefined> | undefined,
): number | null {
  const direct = tags?.ref ?? tags?.hole;
  if (direct != null && String(direct).trim() !== '') {
    const raw = String(direct).trim();
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 36) return n;
    const mDirect = raw.match(/^(?:#|no\.?\s*)?(\d{1,2})\b/i);
    if (mDirect) {
      const parsed = Number(mDirect[1]);
      if (parsed >= 1 && parsed <= 36) return parsed;
    }
  }
  const name = (tags?.name ?? '').trim();
  const m = name.match(
    /^(?:hole\s*#?\s*|#|no\.?\s*)?(\d{1,2})\b/i,
  );
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 36) return n;
  }
  return null;
}

type Pt = { lat: number; lon: number };

interface CoursePoly {
  id: number;
  name: string;
  loop: string;
  ring: Array<{ lat: number; lon: number }>;
}

function loopKey(loop: string | undefined): string {
  return loop ?? '';
}

function polygonArea(ring: Pt[]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    area += a.lon * b.lat - b.lon * a.lat;
  }
  return Math.abs(area);
}

function loopForPoint(pt: Pt, polys: CoursePoly[]): string {
  const hits = polys.filter((p) => pointInPolygon(pt, p.ring));
  if (hits.length) {
    hits.sort((a, b) => polygonArea(a.ring) - polygonArea(b.ring));
    return hits[0]!.loop;
  }
  // Do not snap to a neighbor layout. Adjacent 18s (Wilson/Harding, Torrey
  // North/South) sit a few hundred yards apart — 900 yd used to swallow them.
  if (polys.length >= 2) return '';
  let best: { loop: string; d: number } | null = null;
  for (const p of polys) {
    const c = centroid(p.ring);
    const d = haversineYards(pt.lat, pt.lon, c.lat, c.lon);
    if (!best || d < best.d) best = { loop: p.loop, d };
  }
  return best && best.d < 50 ? best.loop : '';
}

function holeQuality(h: GolfHole): number {
  let score = h.yards;
  if (h.source === 'hole-way') score += 500;
  score += (h.tees?.length ?? 1) * 5;
  if (h.path && h.path.length >= 3) score += 50;
  return score;
}

/** One numbered hole per layout; merge duplicate centerlines / tee boxes. */
function normalizeOnePerNumber(holes: GolfHole[]): GolfHole[] {
  const byLoop = new Map<string, GolfHole[]>();
  for (const h of holes) {
    if (h.number < 1 || h.number > 36) continue;
    const key = loopKey(h.loop);
    const list = byLoop.get(key) ?? [];
    list.push(h);
    byLoop.set(key, list);
  }

  const out: GolfHole[] = [];
  for (const group of byLoop.values()) {
    const byNum = new Map<number, GolfHole[]>();
    for (const h of group) {
      const list = byNum.get(h.number) ?? [];
      list.push(h);
      byNum.set(h.number, list);
    }

    for (const dupes of byNum.values()) {
      dupes.sort((a, b) => holeQuality(b) - holeQuality(a));
      const bucket: GolfHole[] = [{ ...dupes[0]!, tees: dupes[0]!.tees ? [...dupes[0]!.tees!] : undefined }];
      for (let i = 1; i < dupes.length; i += 1) {
        const other = dupes[i]!;
        const dGreen = haversineYards(
          bucket[0]!.green.lat,
          bucket[0]!.green.lon,
          other.green.lat,
          other.green.lon,
        );
        const dTee = haversineYards(
          bucket[0]!.tee.lat,
          bucket[0]!.tee.lon,
          other.tee.lat,
          other.tee.lon,
        );
        if (dGreen >= 90 || dTee >= 140) {
          // Same number, different layout (sibling 18s finishing near one green).
          out.push({
            ...other,
            tees: other.tees ? [...other.tees] : undefined,
          });
          continue;
        }
        upsertTee(bucket, {
          number: bucket[0]!.number,
          loop: loopKey(bucket[0]!.loop),
          label: '',
          yards: other.yards,
          bearingDeg: other.bearingDeg,
          tee: other.tee,
          green: bucket[0]!.green,
          path: other.path,
          par: other.par,
          name: other.name,
          source: other.source,
        });
      }
      out.push(bucket[0]!);
    }
  }
  return out;
}

function centroid(
  pts: Array<{ lat: number; lon: number }>,
): { lat: number; lon: number } {
  let lat = 0;
  let lon = 0;
  for (const p of pts) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / pts.length, lon: lon / pts.length };
}

/** Keep tee, green, and a few midpoints — enough to draw, tiny payload. */
function slimPath(
  geom: Array<{ lat: number; lon: number }>,
  maxPts = 8,
): Array<{ lat: number; lon: number }> {
  if (geom.length <= maxPts) return geom;
  const out: Array<{ lat: number; lon: number }> = [geom[0]!];
  const step = (geom.length - 1) / (maxPts - 1);
  for (let i = 1; i < maxPts - 1; i += 1) {
    out.push(geom[Math.round(i * step)]!);
  }
  out.push(geom[geom.length - 1]!);
  return out;
}

function pointOf(el: OsmElement): { lat: number; lon: number } | null {
  return centerOf(el) ?? (el.geometry?.length ? centroid(el.geometry) : null);
}

function pointInPolygon(
  point: { lat: number; lon: number },
  polygon: Array<{ lat: number; lon: number }>,
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses =
      a.lat > point.lat !== b.lat > point.lat &&
      point.lon <
        ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon;
    if (crosses) inside = !inside;
  }
  return inside;
}

const titleCase = titleCaseName;

function isHoleCountLoop(raw: string): boolean {
  return /^\d+_?holes?$/i.test(raw.trim()) || /^\d+\s*holes?$/i.test(raw.trim());
}

/**
 * True only for an actual layout name (North / South / Black / …), not a
 * club stem like "Los Angeles" stamped from a single leisure=golf_course
 * polygon. Club stems used to block autoLoops, collapsing LACC's 36 holes
 * into one 18.
 */
function isRealLoop(loop: string | undefined): boolean {
  if (!loop) return false;
  if (isHoleCountLoop(loop)) return false;
  if (layoutKey(loop)) return true;
  if (/^(second|third|fourth)\b/i.test(loop)) return true;
  if (/^course\s*\d+$/i.test(loop.trim())) return true;
  // Polygon-derived layout names (Harding / Wilson / Balboa) — not club stems
  // from a single leisure=golf_course way (those stay unlabeled).
  return loop.trim().length >= 3;
}

function holeInPoly(hole: GolfHole, ring: Pt[]): boolean {
  return pointInPolygon(hole.green, ring) || pointInPolygon(hole.tee, ring);
}

function polyContainScore(hole: GolfHole, ring: Pt[]): number {
  return (
    (pointInPolygon(hole.green, ring) ? 2 : 0) +
    (pointInPolygon(hole.tee, ring) ? 1 : 0)
  );
}

function bestOf(group: GolfHole[]): GolfHole {
  return [...group].sort((a, b) => holeQuality(b) - holeQuality(a))[0]!;
}

/**
 * Keep only the selected layout. Sibling 18s in the same OSM bbox must not
 * paint on the course the golfer opened.
 */
function scopeHolesToSelectedCourse(
  holes: GolfHole[],
  polys: CoursePoly[],
  selectedName?: string,
  selectedId?: number,
): GolfHole[] {
  if (!holes.length) return holes;
  const selected = pickPolygonForCourse(polys, selectedName, selectedId);
  const foreign = selectedName
    ? polys.filter((p) => {
        if (selected && p.id === selected.id) return false;
        if (
          namesLooselyMatch(selectedName, p.name) &&
          !namesConflict(selectedName, p.name)
        ) {
          return false;
        }
        return true;
      })
    : [];

  const byNum = new Map<number, GolfHole[]>();
  for (const h of holes) {
    const list = byNum.get(h.number) ?? [];
    list.push(h);
    byNum.set(h.number, list);
  }
  const hasDupes = [...byNum.values()].some((g) => g.length >= 2);

  if (hasDupes && (selected || foreign.length)) {
    const keep: GolfHole[] = [];
    for (const group of byNum.values()) {
      if (group.length === 1) {
        const h = group[0]!;
        if (selected) {
          if (holeInPoly(h, selected.ring)) keep.push(h);
        } else if (!foreign.some((p) => holeInPoly(h, p.ring))) {
          keep.push(h);
        }
        continue;
      }
      if (selected) {
        const ranked = [...group].sort(
          (a, b) =>
            polyContainScore(b, selected.ring) - polyContainScore(a, selected.ring) ||
            holeQuality(b) - holeQuality(a),
        );
        if (polyContainScore(ranked[0]!, selected.ring) > 0) keep.push(ranked[0]!);
        continue;
      }
      const ranked = [...group].sort((a, b) => {
        const aF = Math.max(
          ...foreign.map((p) => polyContainScore(a, p.ring)),
          0,
        );
        const bF = Math.max(
          ...foreign.map((p) => polyContainScore(b, p.ring)),
          0,
        );
        return aF - bF || holeQuality(b) - holeQuality(a);
      });
      if (
        Math.max(...foreign.map((p) => polyContainScore(ranked[0]!, p.ring)), 0) <
        3
      ) {
        keep.push(ranked[0]!);
      }
    }
    if (keep.length >= 7) return keep;
  }

  if (selected) {
    const inside = holes.filter((h) => holeInPoly(h, selected.ring));
    if (inside.length >= 7) return inside;
  }

  if (selectedName && foreign.length) {
    const outsideForeign = holes.filter(
      (h) => !foreign.some((p) => holeInPoly(h, p.ring)),
    );
    if (outsideForeign.length >= 7 && outsideForeign.length < holes.length) {
      return outsideForeign;
    }
  }

  if (selectedName) {
    const byLoop = new Map<string, GolfHole[]>();
    for (const h of holes) {
      const key = (h.loop ?? '').trim();
      if (!key) continue;
      const list = byLoop.get(key) ?? [];
      list.push(h);
      byLoop.set(key, list);
    }
    if (byLoop.size >= 2) {
      const hits: GolfHole[][] = [];
      for (const [loop, group] of byLoop) {
        if (group.length < 7) continue;
        if (namesConflict(selectedName, loop)) continue;
        if (
          namesLooselyMatch(selectedName, loop) ||
          selectedName.toLowerCase().includes(loop.toLowerCase())
        ) {
          hits.push(group);
        }
        const want = layoutKey(selectedName);
        if (want && layoutKey(loop) === want) hits.push(group);
      }
      const unique = [...new Map(hits.map((g) => [g[0]?.loop, g])).values()];
      if (unique.length === 1) return unique[0]!;
    }
  }

  return holes;
}

/** Layout name from OSM tags. golf:course=18_hole means hole count, not North/South. */
function loopFromTags(
  tags: Record<string, string | undefined> | undefined,
): string {
  const named = (
    tags?.['golf:course:name'] ??
    tags?.['course:name'] ??
    ''
  ).trim();
  if (named && !isHoleCountLoop(named)) return layoutLabelFromName(named);
  const raw = (
    tags?.['golf:layout'] ??
    tags?.['golf:course'] ??
    tags?.course ??
    ''
  ).trim();
  if (raw && !isHoleCountLoop(raw)) return layoutLabelFromName(raw);
  const holeName = tags?.name ?? '';
  const dir = holeName.match(/\b(north|south|east|west)\b/i);
  return dir ? titleCase(dir[1]) : '';
}

function extractCoursePolygons(els: OsmElement[]): CoursePoly[] {
  const raw: CoursePoly[] = [];
  for (const el of els) {
    if (el.type !== 'way' || el.tags?.leisure !== 'golf_course') continue;
    const ring = el.geometry;
    if (!ring || ring.length < 4) continue;
    const name = el.tags?.name?.trim();
    if (!name) continue;
    raw.push({
      id: el.id,
      name,
      // Prefer a layout token (Torrey Pines South → South). A single
      // club-only polygon stays unlabeled so autoLoops can split 36 holes.
      loop: layoutKey(name) ? layoutLabelFromName(name) : '',
      ring,
    });
  }
  // Two+ named golf_course polygons in one bbox are sibling layouts
  // (Harding / Wilson), even when they don't share a club-stem prefix.
  if (raw.length >= 2) {
    for (const p of raw) {
      if (!p.loop) p.loop = layoutLabelFromName(p.name);
    }
  }
  const seen = new Map<string, number>();
  return raw.map((p) => {
    if (!p.loop) return p;
    const base = p.loop;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    if (n === 0) return p;
    const short = p.name.replace(/\s*(golf\s+)?course\s*$/i, '').trim();
    return {
      ...p,
      loop: titleCaseName(short.length <= 28 ? short : `${base} ${n + 1}`),
    };
  });
}

function assignLoopsFromPolygons(
  holes: GolfHole[],
  polys: CoursePoly[],
  selectedName?: string,
  selectedId?: number,
): GolfHole[] {
  if (!polys.length) return holes;
  const selected = pickPolygonForCourse(polys, selectedName, selectedId);

  return holes.map((hole) => {
    if (isRealLoop(hole.loop)) return hole;
    let loop = loopForPoint(hole.green, polys) || loopForPoint(hole.tee, polys);
    if (!loop && selected && pointInPolygon(hole.green, selected.ring)) {
      loop = selected.loop;
    }
    return loop ? { ...hole, loop } : hole;
  });
}

function toXY(origin: Pt, p: Pt): { x: number; y: number } {
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    x: ((p.lon - origin.lon) * mLon) / 0.9144,
    y: ((p.lat - origin.lat) * mLat) / 0.9144,
  };
}

function headingDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function holeCorridor(hole: GolfHole): Pt[] {
  const cands = [hole.path, ...(hole.tees ?? []).map((t) => t.path)].filter(
    (p): p is Pt[] => Boolean(p && p.length >= 2),
  );
  let best = cands[0] ?? [hole.tee, hole.green];
  let bestLen = pathLengthYards(best);
  for (const path of cands) {
    const len = pathLengthYards(path);
    if (path.length > best.length + 1 || len > bestLen + 15) {
      best = path;
      bestLen = len;
    }
  }
  return best;
}

function projectOnPath(
  p: Pt,
  path: Pt[],
): { distYd: number; t: number; alongYd: number; holeYd: number; at: Pt } {
  const origin = path[0]!;
  const P = toXY(origin, p);
  const holeYd = Math.max(pathLengthYards(path), 1);
  let bestDist = Infinity;
  let bestAlong = 0;
  let bestAt = path[0]!;
  let covered = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const A = toXY(origin, a);
    const B = toXY(origin, b);
    const vx = B.x - A.x;
    const vy = B.y - A.y;
    const len2 = vx * vx + vy * vy;
    const segYd = Math.sqrt(len2);
    let t = 0;
    if (len2 > 1e-6) t = ((P.x - A.x) * vx + (P.y - A.y) * vy) / len2;
    const tUse = i === 0 ? t : Math.max(0, Math.min(1, t));
    const qx = A.x + tUse * vx;
    const qy = A.y + tUse * vy;
    const dist = Math.hypot(P.x - qx, P.y - qy);
    const along = covered + tUse * segYd;
    if (dist < bestDist) {
      bestDist = dist;
      bestAlong = along;
      bestAt = {
        lat: a.lat + tUse * (b.lat - a.lat),
        lon: a.lon + tUse * (b.lon - a.lon),
      };
    }
    covered += segYd;
  }
  return {
    distYd: bestDist,
    t: bestAlong / holeYd,
    alongYd: bestAlong,
    holeYd,
    at: bestAt,
  };
}

function stitchTeePath(tee: Pt, corridor: Pt[], green: Pt): Pt[] {
  const proj = projectOnPath(tee, corridor);
  if (proj.t <= 0.05) return slimPath([tee, ...corridor]);
  const rest: Pt[] = [tee];
  let passed = false;
  for (const pt of corridor) {
    if (!passed) {
      const along = projectOnPath(pt, corridor).t;
      if (along >= proj.t - 0.02) passed = true;
      else continue;
    }
    rest.push(pt);
  }
  const last = rest[rest.length - 1]!;
  if (haversineYards(last.lat, last.lon, green.lat, green.lon) > 8) {
    rest.push(green);
  }
  return slimPath(rest.length >= 2 ? rest : [tee, green]);
}

function pointAlong(path: Pt[], t: number): Pt {
  const holeYd = Math.max(pathLengthYards(path), 1);
  const target = Math.max(0, Math.min(1, t)) * holeYd;
  let covered = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const seg = haversineYards(a.lat, a.lon, b.lat, b.lon);
    if (covered + seg >= target || i === path.length - 2) {
      const u = seg < 1e-6 ? 1 : (target - covered) / seg;
      return {
        lat: a.lat + u * (b.lat - a.lat),
        lon: a.lon + u * (b.lon - a.lon),
      };
    }
    covered += seg;
  }
  return path[path.length - 1]!;
}

function scoreTeeToHole(
  tee: Pt,
  hole: GolfHole,
  ref: number | null,
  loop: string,
): number | null {
  if (ref != null && hole.number !== ref) return null;
  if (loop && hole.loop && loop !== hole.loop) return null;
  const corridor = holeCorridor(hole);
  const proj = projectOnPath(tee, corridor);
  const dGreen = haversineYards(tee.lat, tee.lon, hole.green.lat, hole.green.lon);
  if (dGreen < 48) return null;
  const behind = proj.alongYd >= -90 && proj.t < 0.02;
  const atTeeingGround = proj.t >= -0.08 && proj.t <= 0.28;
  if (!behind && !atTeeingGround) return null;
  if (proj.distYd > 55 && !(proj.t < 0.06 && proj.distYd < 80)) return null;
  const playYd = dGreen;
  if (playYd > proj.holeYd * 1.32 + 35) return null;
  if (proj.holeYd > 180 && playYd < proj.holeYd * 0.42) return null;
  const aim = pointAlong(corridor, Math.max(0.18, Math.min(0.35, proj.t + 0.2)));
  const head = headingDiff(
    bearingDeg(tee.lat, tee.lon, aim.lat, aim.lon),
    bearingDeg(corridor[0]!.lat, corridor[0]!.lon, aim.lat, aim.lon),
  );
  if (head > 34 && proj.distYd > 22) return null;
  return proj.distYd + Math.max(0, -proj.alongYd) * 0.25 + head * 0.35;
}

function nearestHoleForTee(
  holes: GolfHole[],
  tee: { ref: number | null; loop: string; pt: Pt },
): GolfHole | null {
  const ranked: Array<{ hole: GolfHole; score: number }> = [];
  for (const hole of holes) {
    const score = scoreTeeToHole(tee.pt, hole, tee.ref, tee.loop);
    if (score == null) continue;
    ranked.push({ hole, score });
  }
  if (!ranked.length) return null;
  ranked.sort((a, b) => a.score - b.score);
  const best = ranked[0]!;
  const second = ranked[1];
  if (second && second.score - best.score < 6 && best.score > 24) return null;
  return best.hole;
}

function snapHoleGreens(
  holes: GolfHole[],
  greens: Array<{ ref: number | null; pt: Pt; loop: string }>,
): void {
  for (const hole of holes) {
    let best: { pt: Pt; d: number } | null = null;
    let runner = Infinity;
    for (const g of greens) {
      if (hole.loop && g.loop && hole.loop !== g.loop) continue;
      if (g.ref != null && g.ref !== hole.number) continue;
      const d = haversineYards(hole.green.lat, hole.green.lon, g.pt.lat, g.pt.lon);
      if (d > 28) continue;
      if (!best || d < best.d) {
        runner = best?.d ?? Infinity;
        best = { pt: g.pt, d };
      } else if (d < runner) {
        runner = d;
      }
    }
    if (best && best.d + 8 < runner) hole.green = best.pt;
  }
}

function pruneOutlierTees(holes: GolfHole[]): void {
  for (const hole of holes) {
    const tees = hole.tees;
    if (!tees || tees.length < 2) continue;
    const longest = Math.max(...tees.map((t) => t.yards));
    const kept = tees.filter(
      (t) => t.yards >= longest * 0.48 && t.yards <= longest + 20,
    );
    if (kept.length === tees.length || !kept.length) continue;
    hole.tees = applyTeeKinds(kept);
    const mid =
      hole.tees.find((t) => t.kind === 'mid') ??
      hole.tees[Math.floor((hole.tees.length - 1) / 2)]!;
    hole.yards = mid.yards;
    hole.bearingDeg = mid.bearingDeg;
    hole.tee = mid.tee;
  }
}

function colorFromTags(
  tags: Record<string, string | undefined> | undefined,
): string | undefined {
  const raw = (tags?.colour ?? tags?.color ?? '').trim().toLowerCase();
  return raw || undefined;
}

function labelFromTags(
  tags: Record<string, string | undefined> | undefined,
): string {
  const color = colorFromTags(tags);
  if (color) return titleCase(color);
  const tee = (tags?.tee ?? tags?.['golf:tee'] ?? '').trim();
  if (tee && !/^\d+$/.test(tee)) return titleCase(tee);
  const name = (tags?.name ?? '')
    .replace(/\btee(s| box)?\b/gi, '')
    .replace(/\bhole\s*\d+\b/gi, '')
    .trim();
  if (name && !/^\d+$/.test(name) && name.length < 28) return titleCase(name);
  return '';
}

function kindFromYardage(
  yards: number,
  all: number[],
): TeeKind {
  if (all.length <= 1) return 'mid';
  const sorted = [...all].sort((a, b) => a - b);
  const shortest = sorted[0]!;
  const longest = sorted[sorted.length - 1]!;
  if (yards === longest && longest > shortest + 8) return 'back';
  if (yards === shortest && longest > shortest + 8) return 'front';
  return 'mid';
}

function applyTeeKinds(tees: GolfTeeBox[]): GolfTeeBox[] {
  const yards = tees.map((t) => t.yards);
  return tees
    .map((t) => ({
      ...t,
      kind: kindFromYardage(t.yards, yards),
      label:
        t.label ||
        (kindFromYardage(t.yards, yards) === 'back'
          ? 'Back'
          : kindFromYardage(t.yards, yards) === 'front'
            ? 'Front'
            : 'Middle'),
    }))
    .sort((a, b) => b.yards - a.yards);
}

function upsertTee(
  holes: GolfHole[],
  input: {
    number: number;
    loop: string;
    label: string;
    color?: string;
    yards: number;
    bearingDeg: number;
    tee: { lat: number; lon: number };
    green: { lat: number; lon: number };
    path?: Array<{ lat: number; lon: number }>;
    par?: number;
    name?: string;
    source: 'hole-way' | 'tee-green';
  },
): void {
  const same = holes.find(
    (h) =>
      h.number === input.number &&
      loopKey(h.loop) === loopKey(input.loop || undefined) &&
      haversineYards(h.green.lat, h.green.lon, input.green.lat, input.green.lon) <
        90 &&
      haversineYards(h.tee.lat, h.tee.lon, input.tee.lat, input.tee.lon) < 140,
  );
  if (same) {
    const corridor =
      (same.path && same.path.length >= 3 ? same.path : null) ??
      (input.path && input.path.length >= 3 ? input.path : null) ??
      holeCorridor(same);
    const box: GolfTeeBox = {
      id: `${input.tee.lat.toFixed(5)},${input.tee.lon.toFixed(5)}`,
      label: input.label,
      kind: 'mid',
      color: input.color,
      yards: Math.round(
        Math.max(
          input.yards,
          pathLengthYards(stitchTeePath(input.tee, corridor, same.green)),
        ),
      ),
      bearingDeg: Math.round(
        bearingDeg(input.tee.lat, input.tee.lon, same.green.lat, same.green.lon),
      ),
      tee: input.tee,
      path: stitchTeePath(input.tee, corridor, same.green),
    };
    const tees = same.tees ?? [];
    if (
      tees.some(
        (t) => haversineYards(t.tee.lat, t.tee.lon, input.tee.lat, input.tee.lon) < 12,
      )
    ) {
      return;
    }
    if (tees.length >= 8) return;
    same.path = corridor;
    same.tees = applyTeeKinds([...tees, box]);
    const mid =
      same.tees.find((t) => t.kind === 'mid') ??
      same.tees[Math.floor((same.tees.length - 1) / 2)]!;
    same.yards = mid.yards;
    same.bearingDeg = mid.bearingDeg;
    same.tee = mid.tee;
    if (input.par && !same.par) same.par = input.par;
    if (input.name && !same.name) same.name = input.name;
    if (input.loop && !same.loop) same.loop = input.loop;
    return;
  }
  const box: GolfTeeBox = {
    id: `${input.tee.lat.toFixed(5)},${input.tee.lon.toFixed(5)}`,
    label: input.label,
    kind: 'mid',
    color: input.color,
    yards: input.yards,
    bearingDeg: input.bearingDeg,
    tee: input.tee,
    path: input.path,
  };
  holes.push({
    number: input.number,
    name: input.name,
    par: input.par,
    yards: input.yards,
    bearingDeg: input.bearingDeg,
    tee: input.tee,
    green: input.green,
    path: input.path,
    source: input.source,
    loop: input.loop || undefined,
    tees: applyTeeKinds([box]),
  });
}

const MAX_HOLES = 54;

function autoLoops(holes: GolfHole[]): GolfHole[] {
  const withNums = holes.map((h) => {
    // Strip club-stem "loops" so geographic splitting can run.
    if (h.loop && !isRealLoop(h.loop)) return { ...h, loop: undefined };
    if (isRealLoop(h.loop)) return h;
    if (h.number > 18 && h.number <= 36) {
      return { ...h, loop: 'Second course', number: h.number - 18 };
    }
    return h;
  });
  const unlabeled = withNums.filter((h) => !isRealLoop(h.loop));
  if (unlabeled.length < 2) return withNums;

  const byNum = new Map<number, GolfHole[]>();
  for (const h of unlabeled) {
    const list = byNum.get(h.number) ?? [];
    list.push(h);
    byNum.set(h.number, list);
  }
  const splitNums = [...byNum.entries()].filter(([, g]) => g.length >= 2);

  // Prefer pairing duplicate hole numbers (LACC: two hole-1 greens) over a
  // global mean split — that keeps each 18 intact instead of 17/19.
  if (splitNums.length >= 6) {
    const anchors = splitNums.flatMap(([, g]) => g);
    const lats = anchors.map((h) => h.green.lat);
    const lons = anchors.map((h) => h.green.lon);
    const dLat = Math.max(...lats) - Math.min(...lats);
    const dLon = Math.max(...lons) - Math.min(...lons);
    const ns = dLat >= dLon;
    const assigned = new Map<GolfHole, string>();
    for (const [, group] of splitNums) {
      const sorted = [...group].sort((a, b) =>
        ns ? b.green.lat - a.green.lat : b.green.lon - a.green.lon,
      );
      const hi = ns ? 'North' : 'East';
      const lo = ns ? 'South' : 'West';
      if (sorted.length === 2) {
        assigned.set(sorted[0]!, hi);
        assigned.set(sorted[1]!, lo);
      } else {
        const mid = ns
          ? (sorted[0]!.green.lat + sorted[sorted.length - 1]!.green.lat) / 2
          : (sorted[0]!.green.lon + sorted[sorted.length - 1]!.green.lon) / 2;
        for (const h of sorted) {
          const v = ns ? h.green.lat : h.green.lon;
          assigned.set(h, v >= mid ? hi : lo);
        }
      }
    }
    return withNums.map((h) => {
      if (isRealLoop(h.loop)) return h;
      const loop = assigned.get(h);
      if (loop) return { ...h, loop };
      // Singleton hole numbers: assign by side of the paired greens.
      const paired = [...assigned.entries()];
      if (!paired.length) return h;
      const mean =
        paired.reduce(
          (s, [ph]) => s + (ns ? ph.green.lat : ph.green.lon),
          0,
        ) / paired.length;
      const v = ns ? h.green.lat : h.green.lon;
      return {
        ...h,
        loop: v >= mean ? (ns ? 'North' : 'East') : ns ? 'South' : 'West',
      };
    });
  }

  if (!splitNums.length && unlabeled.length < 20) return withNums;

  const anchors = splitNums.length
    ? splitNums.flatMap(([, g]) => g)
    : unlabeled;
  const lats = anchors.map((h) => h.green.lat);
  const lons = anchors.map((h) => h.green.lon);
  const dLat = Math.max(...lats) - Math.min(...lats);
  const dLon = Math.max(...lons) - Math.min(...lons);
  const meanLat = lats.reduce((s, n) => s + n, 0) / lats.length;
  const meanLon = lons.reduce((s, n) => s + n, 0) / lons.length;
  const ns = dLat >= dLon;

  return withNums.map((h) => {
    if (isRealLoop(h.loop)) return h;
    if (ns) return { ...h, loop: h.green.lat >= meanLat ? 'North' : 'South' };
    return { ...h, loop: h.green.lon >= meanLon ? 'East' : 'West' };
  });
}

/** Apply scorecard pars/yardages and stamp course provenance on every hole. */
function applyScorecards(
  holes: GolfHole[],
  polys: CoursePoly[],
  selectedName?: string,
  selectedId?: number,
): { holes: GolfHole[]; provenance: ScorecardProvenance } {
  const loops = [
    ...new Set(holes.map((h) => h.loop).filter((l): l is string => Boolean(l))),
  ];
  const polyNames = polys.map((p) => p.name);
  const names = selectedName
    ? [selectedName, ...polyNames]
    : polyNames;

  const cards = new Map<string, CourseScorecard>();
  for (const loop of loops) {
    for (const name of names) {
      const card = findScorecard({ courseName: name, loop, osmId: selectedId });
      if (card) {
        cards.set(loop, card);
        break;
      }
    }
  }
  if (!cards.size) {
    const fallbackNames = names.length ? names : [selectedName].filter(Boolean) as string[];
    for (const name of fallbackNames) {
      const card = findScorecard({ courseName: name, osmId: selectedId });
      if (!card) continue;
      cards.set('', card);
      break;
    }
  }
  if (!cards.size && selectedId != null) {
    const card = findScorecard({ osmId: selectedId });
    if (card) cards.set('', card);
  }
  if (!cards.size) {
    const stamped = holes.map((hole) => ({
      ...hole,
      provenance: 'geometric' as const,
    }));
    return { holes: stamped, provenance: 'geometric' };
  }

  let provenance: ScorecardProvenance | null = null;
  for (const card of cards.values()) {
    const p = inferCardProvenance(card);
    const rank = { official: 0, 'imported-par': 1, geometric: 2, template: 3 };
    if (!provenance || rank[p] < rank[provenance]) provenance = p;
  }
  provenance = provenance ?? 'geometric';

  const next = holes.map((hole) => {
    const card = cards.get(hole.loop ?? '') ?? cards.get('');
    if (!card) return { ...hole, provenance };
    const sc = card.holes.find((h) => h.hole === hole.number);
    if (!sc) return { ...hole, provenance };
    const updated: GolfHole = { ...hole, par: sc.par, provenance };
    if (sc.name && !hole.name) updated.name = sc.name;
    if (sc.hcp != null && Number.isFinite(sc.hcp)) {
      updated.strokeIndex = sc.hcp;
    }
    const cardYards = holeHasCardYardage(sc);
    if (cardYards && hole.tees?.length) {
      updated.tees = hole.tees.map((t) => {
        const yds =
          t.kind === 'back'
            ? sc.back
            : t.kind === 'front'
              ? sc.front
              : sc.mid;
        return yds ? { ...t, yards: yds } : t;
      });
      const mid =
        updated.tees.find((t) => t.kind === 'mid') ?? updated.tees[0];
      if (mid) updated.yards = mid.yards;
    } else if (cardYards && sc.mid) {
      updated.yards = sc.mid;
    } else if (cardYards && sc.back) {
      updated.yards = sc.back;
    }
    return updated;
  });

  return { holes: next, provenance };
}

function finalizeHoles(
  holes: GolfHole[],
  polys: CoursePoly[] = [],
  selectedName?: string,
  selectedId?: number,
): { holes: GolfHole[]; provenance: ScorecardProvenance } {
  let next = assignLoopsFromPolygons(holes, polys, selectedName, selectedId);
  next = scopeHolesToSelectedCourse(next, polys, selectedName, selectedId);

  next = autoLoops(next);
  next = scopeHolesToSelectedCourse(next, polys, selectedName, selectedId);
  next = normalizeOnePerNumber(next);
  next = standardizeLayouts(next);
  pruneOutlierTees(next);
  const applied = applyScorecards(next, polys, selectedName, selectedId);
  next = applied.holes;
  next = standardizeLayouts(next);
  next.sort((a, b) => {
    const loop = (a.loop ?? '').localeCompare(b.loop ?? '');
    if (loop) return loop;
    return a.number - b.number;
  });
  next = next.slice(0, 36).map((h) => ({ ...h, geo: inspectHoleGeo(h) }));
  return {
    holes: next,
    provenance: applied.provenance,
  };
}

function holesFromWays(els: OsmElement[], polys: CoursePoly[] = []): GolfHole[] {
  const holes: GolfHole[] = [];

  for (const way of els) {
    if (way.type !== 'way' || way.tags?.golf !== 'hole') continue;
    const geom = way.geometry;
    if (!geom || geom.length < 2) continue;
    const num = parseRef(way.tags);
    if (num == null) continue;
    const tee = geom[0]!;
    const green = geom[geom.length - 1]!;
    const yards = Math.round(pathLengthYards(geom));
    if (yards < 35 || yards > 780) continue;
    let loop = loopFromTags(way.tags);
    if (!loop && polys.length) {
      loop = loopForPoint({ lat: green.lat, lon: green.lon }, polys);
    }
    upsertTee(holes, {
      number: num,
      loop,
      label: labelFromTags(way.tags),
      color: colorFromTags(way.tags),
      yards,
      bearingDeg: Math.round(bearingDeg(tee.lat, tee.lon, green.lat, green.lon)),
      tee: { lat: tee.lat, lon: tee.lon },
      green: { lat: green.lat, lon: green.lon },
      path: slimPath(geom),
      par: way.tags?.par ? Number(way.tags.par) : undefined,
      name: way.tags?.name,
      source: 'hole-way',
    });
  }

  return holes;
}

/** Nine rotation labels from bulk scorecards — not separate courses. */
function isCompleteLayout(holes: GolfHole[]): boolean {
  if (!holes.length) return false;
  const nums = holes.map((h) => h.number).filter((n) => Number.isFinite(n));
  if (nums.length !== 9 && nums.length !== 18) return false;
  const target = nums.length;
  for (let n = 1; n <= target; n += 1) {
    if (!nums.includes(n)) return false;
  }
  return true;
}

function holesFromTeeGreen(
  els: OsmElement[],
  existing: GolfHole[],
): GolfHole[] {
  let holes = existing.map((h) => ({
    ...h,
    tees: h.tees ? [...h.tees] : undefined,
  }));

  const teePts: Array<{
    ref: number | null;
    pt: { lat: number; lon: number };
    par?: number;
    loop: string;
    label: string;
    color?: string;
    name?: string;
  }> = [];
  const greenPts: Array<{
    ref: number | null;
    pt: { lat: number; lon: number };
    loop: string;
  }> = [];

  for (const el of els) {
    const golf = el.tags?.golf;
    if (golf === 'tee') {
      const pt = pointOf(el);
      if (pt) {
        teePts.push({
          ref: parseRef(el.tags),
          pt,
          par: el.tags?.par ? Number(el.tags.par) : undefined,
          loop: loopFromTags(el.tags),
          label: labelFromTags(el.tags),
          color: colorFromTags(el.tags),
          name: el.tags?.name,
        });
      }
    } else if (golf === 'green' || golf === 'pin') {
      const pt = pointOf(el);
      if (pt) {
        greenPts.push({
          ref: parseRef(el.tags),
          pt,
          loop: loopFromTags(el.tags),
        });
      }
    }
  }

  snapHoleGreens(holes, greenPts);

  for (const tee of teePts) {
    const host = holes.length ? nearestHoleForTee(holes, tee) : null;
    if (host) {
      const corridor = holeCorridor(host);
      const path = stitchTeePath(tee.pt, corridor, host.green);
      upsertTee(holes, {
        number: host.number,
        loop: tee.loop || host.loop || '',
        label: tee.label,
        color: tee.color,
        yards: Math.round(pathLengthYards(path)),
        bearingDeg: Math.round(
          bearingDeg(tee.pt.lat, tee.pt.lon, host.green.lat, host.green.lon),
        ),
        tee: tee.pt,
        green: host.green,
        path,
        par: tee.par,
        name: tee.name,
        source: 'tee-green',
      });
      continue;
    }

    // Only build missing holes when the layout is not already complete.
    if (fetchLooksComplete(holes)) continue;
    if (tee.ref == null) continue;

    let best: { pt: Pt; d: number } | null = null;
    for (const g of greenPts) {
      if (tee.ref != null && g.ref != null && tee.ref !== g.ref) continue;
      if (tee.loop && g.loop && tee.loop !== g.loop) continue;
      const d = haversineYards(tee.pt.lat, tee.pt.lon, g.pt.lat, g.pt.lon);
      if (d < 70 || d > 620) continue;
      if (!best || d < best.d) best = { pt: g.pt, d };
    }
    if (!best) continue;

    // Real OSM tee + green points; pairing without matching refs needs review.
    upsertTee(holes, {
      number: tee.ref ?? holes.length + 1,
      loop: tee.loop,
      label: tee.label,
      color: tee.color,
      yards: Math.round(best.d),
      bearingDeg: Math.round(
        bearingDeg(tee.pt.lat, tee.pt.lon, best.pt.lat, best.pt.lon),
      ),
      tee: tee.pt,
      green: best.pt,
      path: [tee.pt, best.pt],
      par: tee.par,
      name: tee.name,
      source: 'tee-green',
    });
  }

  pruneOutlierTees(holes);
  return holes;
}

/** Pure derivation from cached OSM elements (local backups, no Overpass). */
export function deriveHolesFromOsmElements(
  elements: OsmElement[],
  options?: { courseName?: string; osmId?: number },
): GolfHole[] {
  const polys = extractCoursePolygons(elements);
  let holes = holesFromTeeGreen(elements, holesFromWays(elements, polys));
  return finalizeHoles(
    holes,
    polys,
    options?.courseName,
    options?.osmId,
  ).holes;
}

async function queryGolfBundle(scope: string): Promise<OsmElement[]> {
  const query = `
[out:json][timeout:8];
way["golf"="hole"](${scope});
out geom;
(
  nwr["golf"="tee"](${scope});
  nwr["golf"="green"](${scope});
  nwr["golf"="pin"](${scope});
);
out center tags;
way["leisure"="golf_course"](${scope});
out geom;
`.trim();
  const raw = (await overpass(query, {
    timeoutMs: 4_000,
    hedgeMs: 900,
  })) as { elements?: OsmElement[] };
  return raw.elements ?? [];
}

async function holesInScope(
  scope: string,
  selectedName?: string,
  selectedId?: number,
): Promise<GolfHole[]> {
  const els = await queryGolfBundle(scope);
  const polys = extractCoursePolygons(els);
  const holes = holesFromTeeGreen(els, holesFromWays(els, polys));
  return finalizeHoles(holes, polys, selectedName, selectedId).holes;
}

function fetchLooksComplete(holes: GolfHole[]): boolean {
  const loops = [
    ...new Set(holes.map((h) => h.loop).filter((l): l is string => isRealLoop(l))),
  ];
  if (loops.length >= 2) {
    // Scoped layout, or both siblings already in-hand — never widen the bbox.
    return holes.length >= 9;
  }
  return holes.length >= 18;
}

type OsmMapHolesResult =
  | { kind: 'ok'; holes: GolfHole[] }
  | { kind: 'too-large' }
  | { kind: 'error' };

/**
 * Read a small course bbox from OSM's main map API. This avoids overloaded
 * Overpass for local courses while still using authoritative OSM geometry.
 */
async function holesFromOsmMap(
  bboxInput: string | OsmMapBbox,
  osmType?: string | null,
  osmId?: number,
  expanded = false,
  courseName?: string,
  req?: Request,
): Promise<OsmMapHolesResult> {
  const bbox =
    typeof bboxInput === 'string' ? parseMapBbox(bboxInput) : bboxInput;
  if (!bbox) return { kind: 'error' };

  const fetched = await fetchOsmMapElements(bbox, {
    timeoutMs: 10_000,
    attempts: 2,
    req,
    courseName,
  });
  if (fetched.kind === 'too-large') return { kind: 'too-large' };
  if (fetched.kind === 'error') return { kind: 'error' };
  const elements = fetched.elements;

  const polys = extractCoursePolygons(elements);
  let holes = holesFromWays(elements, polys);
  holes = holesFromTeeGreen(elements, holes);
  const labeledResult = finalizeHoles(
    holes,
    polys,
    courseName,
    Number.isFinite(osmId) ? osmId : undefined,
  );
  const labeled = labeledResult.holes;
  const hasSelectedOsm =
    Number.isFinite(osmId) && (osmId as number) > 0;

  // Widen when bbox clipped a sibling 18 or duplicate centerlines sit outside.
  // Never widen when a specific course OSM id is requested — neighbors
  // (e.g. Augusta Country Club next to Augusta National) pollute the map.
  const holeWays = elements.filter((e) => e.tags?.golf === 'hole');
  const rawRefs = holeWays
    .map((e) => parseRef(e.tags))
    .filter((n): n is number => n != null);
  const dupRefs = rawRefs.length - new Set(rawRefs).size;
  const needsWiden =
    !hasSelectedOsm &&
    ((!expanded && dupRefs > 0 && labeled.length <= 18) ||
      (!expanded &&
        polys.length >= 2 &&
        labeled.length > 0 &&
        labeled.length < polys.length * 14));
  if (!needsWiden) return { kind: 'ok', holes: labeled };

  let next = padBbox(bbox, dupRefs > 0 ? 0.4 : 0.2);
  if (polys.length) {
    let s = Infinity;
    let w = Infinity;
    let n = -Infinity;
    let e = -Infinity;
    for (const poly of polys) {
      for (const pt of poly.ring) {
        s = Math.min(s, pt.lat);
        n = Math.max(n, pt.lat);
        w = Math.min(w, pt.lon);
        e = Math.max(e, pt.lon);
      }
    }
    next = {
      south: s - 0.002,
      west: w - 0.002,
      north: n + 0.002,
      east: e + 0.002,
    };
  }
  if (bboxArea(next) > 0.08) return { kind: 'ok', holes: labeled };
  const wider = await holesFromOsmMap(
    next,
    osmType,
    osmId,
    true,
    courseName,
    req,
  );
  if (wider.kind === 'ok' && wider.holes.length > labeled.length) {
    return wider;
  }
  return { kind: 'ok', holes: labeled };
}

/** Parse `bbox=south,west,north,east`, padded to catch edge tees. */
function parseBbox(raw: string | null): string | null {
  const parsed = parseMapBbox(raw);
  if (!parsed) return null;
  const pad = 0.004; // ~440 m — tees on the edge without swallowing the city
  return holesBboxKey({
    south: quantizeCoord(parsed.south - pad, 4),
    west: quantizeCoord(parsed.west - pad, 4),
    north: quantizeCoord(parsed.north + pad, 4),
    east: quantizeCoord(parsed.east + pad, 4),
  });
}

function aroundScope(lat: number, lon: number, radiusM: number): string {
  return `around:${radiusM},${lat},${lon}`;
}

export default async function handler(req: Request): Promise<Response> {
  const limited = rateLimit(req, RATE.holes);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const rawLat = Number(searchParams.get('lat'));
  const rawLon = Number(searchParams.get('lon'));
  const bbox = parseBbox(searchParams.get('bbox'));
  const osmType = searchParams.get('osmType');
  const osmId = Number(searchParams.get('osmId'));
  const courseName = searchParams.get('courseName')?.trim() ?? '';
  const radiusM = Math.min(
    Math.max(Number(searchParams.get('radius') ?? 1800), 500),
    4000,
  );

  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
    return errResponse('lat and lon required', 400);
  }

  const lat = quantizeCoord(rawLat, 4);
  const lon = quantizeCoord(rawLon, 4);
  const courseKey = [
    osmType ?? '',
    Number.isFinite(osmId) ? String(osmId) : '',
    courseName.trim().toLowerCase(),
  ].join(':');
  const cacheKey = `h10:${lat}:${lon}:${bbox ?? ''}:${radiusM}:${courseKey}`;
  const cached = HOLE_MEM.get(cacheKey);
  if (cached && Date.now() - cached.at < HOLE_MEM_TTL_MS && cached.holes.length) {
    return jsonResponse(
      {
        holes: cached.holes,
        count: cached.holes.length,
        scope: 'cache',
        provenance: cached.holes[0]?.provenance ?? 'geometric',
        attribution: '© OpenStreetMap contributors (ODbL)',
      },
      3600,
      604_800,
    );
  }

  type Scope = { name: string; queryScope: string };
  const scopes: Scope[] = [];

  if (bbox) scopes.push({ name: 'course-bbox', queryScope: bbox });
  else if (
    (osmType === 'way' || osmType === 'relation') &&
    Number.isFinite(osmId)
  ) {
    scopes.push({
      name: 'course-area',
      queryScope: `area:${osmType}:${osmId}`,
    });
  }
  // Escalating radii cover municipal parks and country clubs that span a mile+.
  for (const r of Array.from(
    new Set([radiusM, Math.max(radiusM, 2200)]),
  ).sort((a, b) => a - b)) {
    scopes.push({
      name: `radius-${r}`,
      queryScope: aroundScope(lat, lon, r),
    });
  }

  let lastError: string | null = null;
  let best: { holes: GolfHole[]; scope: string } = { holes: [], scope: 'none' };
  const startedAt = Date.now();
  // Map downloads for dense clubs can take ~3–8s; keep budget above that so
  // we don't abandon a healthy OSM map fetch and fall into a busy Overpass.
  const HARD_BUDGET_MS = 12_000;

  // Prefer OSM's main map API for a course bbox. Public Overpass mirrors are
  // often busy; map.json is local-to-the-bbox and keeps Golf working offline
  // from Overpass health. When the client didn't send a bbox, synthesize one.
  const mapBbox =
    (bbox ? parseMapBbox(bbox) : null) ??
    bboxFromLatLon(lat, lon, Math.min(radiusM, 2200));

  const tryMap = async (
    box: OsmMapBbox,
    scopeName: string,
  ): Promise<boolean> => {
    let current = box;
    // Dense tourist coasts (Pebble Beach) exceed OSM's 50k-node map limit at
    // ~1.8 km. Shrink toward the pin and retry before giving up on map.json.
    for (let shrink = 0; shrink < 5; shrink += 1) {
      if (Date.now() - startedAt > HARD_BUDGET_MS) break;
      const mapHoles = await holesFromOsmMap(
        current,
        osmType,
        osmId,
        false,
        courseName || undefined,
        req,
      );
      if (mapHoles.kind === 'too-large') {
        current = shrinkBbox(current, 0.72);
        continue;
      }
      // Transport failure → fall through to Overpass (or a wider/narrower box).
      if (mapHoles.kind === 'error') return false;
      if (mapHoles.holes.length > best.holes.length) {
        best = {
          holes: mapHoles.holes,
          scope: shrink > 0 ? `${scopeName}-shrink${shrink}` : scopeName,
        };
      }
      return fetchLooksComplete(mapHoles.holes);
    }
    return false;
  };

  if (await tryMap(mapBbox, bbox ? 'osm-map' : 'osm-map-synth')) {
    const holesWithElevation = await addElevations(best.holes);
    HOLE_MEM.set(cacheKey, { at: Date.now(), holes: holesWithElevation });
    return jsonResponse(
      {
        holes: holesWithElevation,
        count: holesWithElevation.length,
        scope: best.scope,
        provenance: holesWithElevation[0]?.provenance ?? 'geometric',
        attribution: '© OpenStreetMap contributors (ODbL)',
      },
      3600,
      604_800,
    );
  }

  // Prefer returning a partial map hit over waiting on Overpass.
  if (best.holes.length >= 7 && Date.now() - startedAt > 2_000) {
    const holesWithElevation = await addElevations(best.holes);
    HOLE_MEM.set(cacheKey, { at: Date.now(), holes: holesWithElevation });
    return jsonResponse(
      {
        holes: holesWithElevation,
        count: holesWithElevation.length,
        scope: best.scope,
        provenance: holesWithElevation[0]?.provenance ?? 'geometric',
        attribution: '© OpenStreetMap contributors (ODbL)',
      },
      3600,
      604_800,
    );
  }

  for (const scope of scopes) {
    if (Date.now() - startedAt > HARD_BUDGET_MS) break;
    if (fetchLooksComplete(best.holes)) break;
    try {
      let holes: GolfHole[];
      if (scope.queryScope.startsWith('area:')) {
        const [, type, id] = scope.queryScope.split(':');
        const areaQuery = `
[out:json][timeout:8];
${type === 'way' ? 'way' : 'rel'}(id:${id});
map_to_area->.course;
way["golf"="hole"](area.course);
out geom;
(
  nwr["golf"="tee"](area.course);
  nwr["golf"="green"](area.course);
  nwr["golf"="pin"](area.course);
);
out center tags;
way["leisure"="golf_course"](area.course);
out geom;
`.trim();
        const bundle = (await overpass(areaQuery, {
          timeoutMs: 4_000,
          hedgeMs: 900,
        })) as { elements?: OsmElement[] };
        const els = bundle.elements ?? [];
        holes = finalizeHoles(
          holesFromTeeGreen(els, holesFromWays(els, extractCoursePolygons(els))),
          extractCoursePolygons(els),
          courseName || undefined,
          Number.isFinite(osmId) ? osmId : undefined,
        ).holes;
      } else {
        holes = await holesInScope(
          scope.queryScope,
          courseName || undefined,
          Number.isFinite(osmId) ? osmId : undefined,
        );
      }

      if (holes.length > best.holes.length) {
        best = { holes, scope: scope.name };
      }
      if (fetchLooksComplete(holes)) break;
      // Good enough to paint — don't burn the rest of the budget.
      if (holes.length >= 9) break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'overpass failed';
    }
  }

  // Overpass busy / empty → one more direct OSM map attempt with a wider box.
  if (
    !fetchLooksComplete(best.holes) &&
    Date.now() - startedAt < HARD_BUDGET_MS
  ) {
    const wider = padBbox(mapBbox, 0.5);
    if (bboxArea(wider) <= 0.1) {
      await tryMap(wider, 'osm-map-retry');
    }
  }

  if (!best.holes.length) {
    // Live OSM + Overpass empty/failed → durable hole-pack backup.
    const pack = await loadHolePackBackup(req, {
      lat,
      lon,
      courseName: courseName || undefined,
    });
    if (pack?.holes?.length) {
      const holesWithElevation = await addElevations(
        pack.holes as GolfHole[],
      );
      HOLE_MEM.set(cacheKey, { at: Date.now(), holes: holesWithElevation });
      return jsonResponse(
        {
          holes: holesWithElevation,
          count: holesWithElevation.length,
          scope: 'osm-backup',
          provenance: holesWithElevation[0]?.provenance ?? 'geometric',
          attribution: '© OpenStreetMap contributors (ODbL)',
        },
        3600,
        604_800,
      );
    }
    // Only error when every Overpass attempt failed and map also found nothing.
    if (lastError) return errResponse(lastError);
    return jsonResponse(
      {
        holes: [],
        count: 0,
        scope: 'none',
        provenance: 'geometric',
        attribution: '© OpenStreetMap contributors (ODbL)',
      },
      600,
      3600,
    );
  }

  const holesWithElevation = await addElevations(best.holes);
  HOLE_MEM.set(cacheKey, { at: Date.now(), holes: holesWithElevation });

  return jsonResponse(
    {
      holes: holesWithElevation,
      count: holesWithElevation.length,
      scope: best.scope,
      provenance: holesWithElevation[0]?.provenance ?? 'geometric',
      attribution: '© OpenStreetMap contributors (ODbL)',
    },
    3600,
    604_800,
  );
}
