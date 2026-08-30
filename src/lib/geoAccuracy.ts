/**
 * Course / hole geographic confidence — JSON-pack layer that can later
 * map onto PostGIS. Never invents coordinates.
 */

import { geodesicYards } from './geodesic';
import { isClubSibling } from '../../api/golf/_lib/courseRelate';

export type GeoConfidence =
  | 'VERIFIED'
  | 'HIGH_CONFIDENCE'
  | 'NEEDS_REVIEW'
  | 'UNVERIFIED';

export type GeoVerificationStatus =
  | 'VERIFIED'
  | 'HIGH_CONFIDENCE'
  | 'NEEDS_REVIEW'
  | 'NEEDS_VERIFICATION'
  | 'DATA_UNVERIFIED';

export type GeometrySourceRank =
  | 'official-gis'
  | 'reliable-dataset'
  | 'osm'
  | 'satellite'
  | 'manual'
  | 'unknown';

export type GeoIssueCode =
  | 'FABRICATED_TEE'
  | 'MISSING_TEE'
  | 'IDENTICAL_COORDS'
  | 'IDENTICAL_HOLE_PAIR'
  | 'TEE_GREEN_TOO_SHORT'
  | 'TEE_GREEN_TOO_LONG'
  | 'HOLE_COUNT_MISMATCH'
  | 'HOLE_NUMBER_GAP'
  | 'DUPLICATE_COURSE'
  | 'CITY_CENTER_SUSPECT'
  | 'GREEN_FAR_FROM_COURSE'
  | 'WATER_OR_NULL_ISLAND'
  | 'UNNUMBERED_LAYOUT';

export interface GeoIssue {
  code: GeoIssueCode;
  detail: string;
}

export interface GeoAccuracyMeta {
  confidence: GeoConfidence;
  status: GeoVerificationStatus;
  sourceRank: GeometrySourceRank;
  issues: GeoIssue[];
}

/** Minimal hole shape so this module stays free of the client golf fetchers. */
export type GeoHoleLike = {
  number: number;
  tee: { lat: number; lon: number };
  green: { lat: number; lon: number };
  path?: Array<{ lat: number; lon: number }>;
  source?: string;
  geo?: GeoAccuracyMeta;
};

export type GeoCourseLike = {
  id?: string;
  name: string;
  lat: number;
  lon: number;
  bbox?: [number, number, number, number];
};

export const FABRICATED_TEE_LAT_OFFSET = 0.00125;
const FABRICATED_LAT_EPS = 1e-7;
const FABRICATED_LON_EPS = 1e-7;

/** OSM greens-only fallback placed the tee this far due south of the green. */
export function isFabricatedSouthTee(
  tee: { lat: number; lon: number },
  green: { lat: number; lon: number },
): boolean {
  if (!tee || !green) return false;
  const dLat = green.lat - tee.lat;
  const dLon = Math.abs(tee.lon - green.lon);
  return (
    Math.abs(dLat - FABRICATED_TEE_LAT_OFFSET) < FABRICATED_LAT_EPS &&
    dLon < FABRICATED_LON_EPS
  );
}

export function emptyGeoMeta(
  extras?: Partial<GeoAccuracyMeta>,
): GeoAccuracyMeta {
  return {
    confidence: 'UNVERIFIED',
    status: 'DATA_UNVERIFIED',
    sourceRank: 'unknown',
    issues: [],
    ...extras,
  };
}

function rankIssues(issues: GeoIssue[]): {
  confidence: GeoConfidence;
  status: GeoVerificationStatus;
} {
  if (issues.some((i) => i.code === 'FABRICATED_TEE' || i.code === 'MISSING_TEE')) {
    return { confidence: 'UNVERIFIED', status: 'DATA_UNVERIFIED' };
  }
  if (
    issues.some(
      (i) =>
        i.code === 'IDENTICAL_COORDS' ||
        i.code === 'WATER_OR_NULL_ISLAND' ||
        i.code === 'UNNUMBERED_LAYOUT',
    )
  ) {
    return { confidence: 'UNVERIFIED', status: 'NEEDS_VERIFICATION' };
  }
  if (issues.length) {
    return { confidence: 'NEEDS_REVIEW', status: 'NEEDS_REVIEW' };
  }
  return { confidence: 'HIGH_CONFIDENCE', status: 'HIGH_CONFIDENCE' };
}

export function inspectHoleGeo(hole: GeoHoleLike): GeoAccuracyMeta {
  const issues: GeoIssue[] = [];
  const tee = hole.tee;
  const green = hole.green;

  if (!tee || !green) {
    issues.push({
      code: 'MISSING_TEE',
      detail: 'Hole is missing tee or green coordinates.',
    });
    return {
      confidence: 'UNVERIFIED',
      status: 'DATA_UNVERIFIED',
      sourceRank: 'unknown',
      issues,
    };
  }

  if (tee.lat === 0 && tee.lon === 0 && green.lat === 0 && green.lon === 0) {
    issues.push({
      code: 'WATER_OR_NULL_ISLAND',
      detail: 'Coordinates at 0,0 — not a golf course.',
    });
  }

  if (
    Math.abs(tee.lat - green.lat) < 1e-7 &&
    Math.abs(tee.lon - green.lon) < 1e-7
  ) {
    issues.push({
      code: 'IDENTICAL_COORDS',
      detail: 'Tee and green share the same point.',
    });
  }

  if (isFabricatedSouthTee(tee, green)) {
    issues.push({
      code: 'FABRICATED_TEE',
      detail:
        'Tee is the greens-only fallback (~140 yd due south of the green), not a mapped tee.',
    });
  }

  const yards = geodesicYards(tee.lat, tee.lon, green.lat, green.lon);
  if (Number.isFinite(yards)) {
    if (yards < 50) {
      issues.push({
        code: 'TEE_GREEN_TOO_SHORT',
        detail: `Tee→green ${Math.round(yards)} yd is below a playable hole.`,
      });
    } else if (yards > 750) {
      issues.push({
        code: 'TEE_GREEN_TOO_LONG',
        detail: `Tee→green ${Math.round(yards)} yd exceeds typical hole length.`,
      });
    }
  }

  const sourceRank: GeometrySourceRank =
    hole.source === 'hole-way' ? 'osm' : 'osm';
  let { confidence, status } = rankIssues(issues);
  if (!issues.length && hole.source === 'hole-way' && (hole.path?.length ?? 0) >= 3) {
    confidence = 'HIGH_CONFIDENCE';
    status = 'HIGH_CONFIDENCE';
  } else if (!issues.length && hole.source === 'tee-green') {
    confidence = 'NEEDS_REVIEW';
    status = 'NEEDS_REVIEW';
  }

  if (hole.geo?.confidence === 'VERIFIED' && !issues.length) {
    return {
      confidence: 'VERIFIED',
      status: 'VERIFIED',
      sourceRank: hole.geo.sourceRank ?? 'manual',
      issues,
    };
  }

  return { confidence, status, sourceRank, issues };
}

export function annotateHoleGeo<T extends GeoHoleLike>(hole: T): T {
  const geo = inspectHoleGeo(hole);
  return { ...hole, geo };
}

export function annotateHolesGeo<T extends GeoHoleLike>(holes: T[]): T[] {
  return holes.map(annotateHoleGeo);
}

export function inspectLayoutGeo(
  holes: GeoHoleLike[],
  expectedHoles?: number | null,
): GeoIssue[] {
  const issues: GeoIssue[] = [];
  const nums = holes
    .map((h) => h.number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const unique = [...new Set(nums)];
  if (unique.length && unique.length !== nums.length) {
    issues.push({
      code: 'HOLE_NUMBER_GAP',
      detail: 'Duplicate hole numbers in layout.',
    });
  }
  if (unique.length >= 2) {
    const hi = unique[unique.length - 1]!;
    const lo = unique[0]!;
    for (let n = lo; n <= hi; n += 1) {
      if (!unique.includes(n)) {
        issues.push({
          code: 'HOLE_NUMBER_GAP',
          detail: `Missing hole ${n} in playing order.`,
        });
        break;
      }
    }
  }
  if (
    expectedHoles != null &&
    (expectedHoles === 9 || expectedHoles === 18) &&
    unique.length &&
    unique.length !== expectedHoles
  ) {
    issues.push({
      code: 'HOLE_COUNT_MISMATCH',
      detail: `Layout has ${unique.length} holes; catalog expects ${expectedHoles}.`,
    });
  }

  for (let i = 0; i < holes.length; i += 1) {
    for (let j = i + 1; j < holes.length; j += 1) {
      const a = holes[i]!;
      const b = holes[j]!;
      if (
        Math.abs(a.tee.lat - b.tee.lat) < 1e-6 &&
        Math.abs(a.tee.lon - b.tee.lon) < 1e-6 &&
        Math.abs(a.green.lat - b.green.lat) < 1e-6 &&
        Math.abs(a.green.lon - b.green.lon) < 1e-6
      ) {
        issues.push({
          code: 'IDENTICAL_HOLE_PAIR',
          detail: `Holes ${a.number} and ${b.number} share identical tee and green.`,
        });
      }
    }
  }
  return issues;
}

export function courseCentroidFromHoles(holes: GeoHoleLike[]): {
  lat: number;
  lon: number;
} | null {
  if (!holes.length) return null;
  let lat = 0;
  let lon = 0;
  for (const h of holes) {
    lat += (h.tee.lat + h.green.lat) / 2;
    lon += (h.tee.lon + h.green.lon) / 2;
  }
  return { lat: lat / holes.length, lon: lon / holes.length };
}

export function inspectCourseLocation(opts: {
  lat: number;
  lon: number;
  holes?: GeoHoleLike[];
}): GeoIssue[] {
  const issues: GeoIssue[] = [];
  const { lat, lon, holes } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    issues.push({
      code: 'WATER_OR_NULL_ISLAND',
      detail: 'Course coordinates are not finite.',
    });
    return issues;
  }
  if (Math.abs(lat) < 0.05 && Math.abs(lon) < 0.05) {
    issues.push({
      code: 'WATER_OR_NULL_ISLAND',
      detail: 'Course pin is at null island.',
    });
  }
  const c = holes?.length ? courseCentroidFromHoles(holes) : null;
  if (c) {
    const yd = geodesicYards(lat, lon, c.lat, c.lon);
    if (yd > 2500) {
      issues.push({
        code: 'CITY_CENTER_SUSPECT',
        detail: `Course pin is ${Math.round(yd)} yd from hole centroid.`,
      });
    }
  }
  return issues;
}

/** Flag name+proximity duplicates. Never merge. */
export function flagDuplicateCourses(
  courses: Array<{ name: string; lat: number; lon: number; slug?: string }>,
  proximityYd = 350,
): GeoIssue[] {
  const issues: GeoIssue[] = [];
  for (let i = 0; i < courses.length; i += 1) {
    for (let j = i + 1; j < courses.length; j += 1) {
      const a = courses[i]!;
      const b = courses[j]!;
      const yd = geodesicYards(a.lat, a.lon, b.lat, b.lon);
      if (yd > proximityYd) continue;
      const sameName = a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
      const siblings = isClubSibling(a.name, b.name);
      if (sameName) {
        issues.push({
          code: 'DUPLICATE_COURSE',
          detail: `"${a.name}" appears twice within ${Math.round(yd)} yd (${a.slug ?? ''} / ${b.slug ?? ''}). Flagged, not merged.`,
        });
      } else if (siblings) {
        /* multi-course facility — keep separate */
      }
    }
  }
  return issues;
}

function distPointToSegmentYards(
  lat: number,
  lon: number,
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const ab = geodesicYards(a.lat, a.lon, b.lat, b.lon);
  if (ab < 1) return geodesicYards(lat, lon, a.lat, a.lon);
  // Local ENU interpolation is adequate for <800 yd segments.
  const toRad = (d: number) => (d * Math.PI) / 180;
  const mLat = 111_320;
  const mLon = 111_320 * Math.cos(toRad((a.lat + b.lat) / 2));
  const bx = ((b.lon - a.lon) * mLon) / 0.9144;
  const by = ((b.lat - a.lat) * mLat) / 0.9144;
  const px = ((lon - a.lon) * mLon) / 0.9144;
  const py = ((lat - a.lat) * mLat) / 0.9144;
  const ab2 = bx * bx + by * by;
  let t = ab2 > 0 ? (px * bx + py * by) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.lat + t * (b.lat - a.lat);
  const qy = a.lon + t * (b.lon - a.lon);
  return geodesicYards(lat, lon, qx, qy);
}

export function distanceToHoleCorridorYards(
  lat: number,
  lon: number,
  hole: GeoHoleLike,
): number {
  const pts =
    hole.path && hole.path.length >= 2
      ? hole.path
      : [hole.tee, hole.green];
  let best = Infinity;
  for (let i = 1; i < pts.length; i += 1) {
    const d = distPointToSegmentYards(lat, lon, pts[i - 1]!, pts[i]!);
    if (d < best) best = d;
  }
  return best;
}

export interface GpsHoleIdentifyInput {
  lat: number;
  lon: number;
  accuracyM?: number | null;
  holes: GeoHoleLike[];
  previousHole?: number | null;
  bbox?: [number, number, number, number] | null;
}

export interface GpsHoleIdentifyResult {
  holeNumber: number;
  confidence: GeoConfidence;
  corridorYards: number;
  reason: string;
}

function pointInBbox(
  lat: number,
  lon: number,
  bbox: [number, number, number, number],
  padDeg = 0.004,
): boolean {
  const [south, west, north, east] = bbox;
  return (
    lat >= south - padDeg &&
    lat <= north + padDeg &&
    lon >= west - padDeg &&
    lon <= east + padDeg
  );
}

/**
 * Pick the hole being played: corridor + playing order + GPS accuracy.
 * Not nearest-green-only.
 */
export function identifyHoleFromGps(
  input: GpsHoleIdentifyInput,
): GpsHoleIdentifyResult | null {
  const { lat, lon, holes, previousHole, bbox } = input;
  if (!holes.length) return null;
  if (bbox && !pointInBbox(lat, lon, bbox)) {
    /* still try — player may be just off the OSM polygon */
  }

  const accuracyYd =
    input.accuracyM != null && Number.isFinite(input.accuracyM)
      ? input.accuracyM * 1.093_613_3
      : 25;

  const scored = holes.map((h) => {
    const corridor = distanceToHoleCorridorYards(lat, lon, h);
    const toGreen = geodesicYards(lat, lon, h.green.lat, h.green.lon);
    const toTee = geodesicYards(lat, lon, h.tee.lat, h.tee.lon);
    let score = corridor;
    if (previousHole != null && Number.isFinite(previousHole)) {
      if (h.number === previousHole) score -= 18;
      if (h.number === previousHole + 1) {
        if (toTee < 80) score -= 35;
        else score -= 8;
      }
      if (h.number < previousHole - 1) score += 40;
    }
    if (toGreen < 40 && corridor < 50) score -= 12;
    score += Math.min(20, accuracyYd * 0.15);
    return { hole: h, corridor, toGreen, toTee, score };
  });

  scored.sort((a, b) => a.score - b.score);
  const best = scored[0];
  const second = scored[1];
  if (!best) return null;

  const margin = second ? second.score - best.score : 80;
  let confidence: GeoConfidence = 'NEEDS_REVIEW';
  if (best.corridor <= 55 && margin >= 25 && accuracyYd <= 25) {
    confidence = 'HIGH_CONFIDENCE';
  } else if (best.corridor <= 90 && margin >= 12) {
    confidence = 'NEEDS_REVIEW';
  } else {
    confidence = 'UNVERIFIED';
  }

  if (best.corridor > 220) {
    return {
      holeNumber: best.hole.number,
      confidence: 'UNVERIFIED',
      corridorYards: best.corridor,
      reason: 'GPS is far from every hole corridor.',
    };
  }

  return {
    holeNumber: best.hole.number,
    confidence,
    corridorYards: Math.round(best.corridor),
    reason:
      previousHole === best.hole.number
        ? 'Still on the previous hole corridor'
        : previousHole != null && best.hole.number === previousHole + 1
          ? 'Advanced to the next hole in playing order'
          : 'Closest hole corridor (geometry, not green-only)',
  };
}

export function identifyCourseFromGps<T extends GeoCourseLike>(
  lat: number,
  lon: number,
  courses: T[],
  accuracyM?: number | null,
): {
  course: T;
  confidence: GeoConfidence;
  yards: number;
  ambiguousWith?: string;
} | null {
  if (!courses.length) return null;
  const accuracyYd =
    accuracyM != null && Number.isFinite(accuracyM)
      ? accuracyM * 1.093_613_3
      : 25;

  const ranked = courses
    .map((c) => {
      const yd = geodesicYards(lat, lon, c.lat, c.lon);
      let inside = false;
      if (c.bbox) inside = pointInBbox(lat, lon, c.bbox, 0.001);
      return { course: c, yd, inside };
    })
    .sort((a, b) => {
      if (a.inside !== b.inside) return a.inside ? -1 : 1;
      return a.yd - b.yd;
    });

  const best = ranked[0];
  const second = ranked[1];
  if (!best) return null;
  if (!best.inside && best.yd > 700 + accuracyYd) return null;

  const closeSecond =
    second &&
    Math.abs(best.yd - second.yd) < 180 &&
    !isClubSibling(best.course.name, second.course.name);

  if (closeSecond) {
    return {
      course: best.course,
      confidence: 'NEEDS_REVIEW',
      yards: Math.round(best.yd),
      ambiguousWith: second.course.name,
    };
  }

  return {
    course: best.course,
    confidence: best.inside ? 'HIGH_CONFIDENCE' : 'NEEDS_REVIEW',
    yards: Math.round(best.yd),
  };
}

export const GEO_AUDIT_LOG_KEY = 'teeready-geo-audit-log-v1';

export type GeoAuditLogEntry = {
  at: string;
  who: string;
  slug: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
};

export function readGeoAuditLog(): GeoAuditLogEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GEO_AUDIT_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GeoAuditLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendGeoAuditLog(entry: Omit<GeoAuditLogEntry, 'at'>): void {
  const next: GeoAuditLogEntry = {
    ...entry,
    at: new Date().toISOString(),
  };
  const all = [next, ...readGeoAuditLog()].slice(0, 500);
  try {
    localStorage.setItem(GEO_AUDIT_LOG_KEY, JSON.stringify(all));
  } catch {
    /* quota */
  }
}
