// Tee-only ranging: haversine splits, bag distance rings, altitude vs sea level.

import { haversineMiles } from './geo';
import type { GolfHole } from './golf';
import { destPoint, type LonLat } from './golfWind';
import type { BagClub } from './golfProfile';

export const YARDS_PER_MILE = 1760;
export const ALTITUDE_PCT_PER_1000_FT = 2;

export function haversineYards(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return haversineMiles(aLat, aLon, bLat, bLon) * YARDS_PER_MILE;
}

export function metersToFeet(m: number): number {
  return m * 3.28084;
}

export function altitudeBonusPct(elevFt: number): number {
  if (!Number.isFinite(elevFt) || elevFt <= 0) return 0;
  return (elevFt / 1000) * ALTITUDE_PCT_PER_1000_FT;
}

/** Map yards converted to the sea-level carry they play like at this altitude. */
export function seaLevelYards(mapYards: number, elevFt: number): number {
  const factor = 1 + altitudeBonusPct(elevFt) / 100;
  return Math.max(1, Math.round(mapYards / factor));
}

export function segmentPlaysLike(
  segmentYards: number,
  holeYards: number,
  windAdjYards: number,
  slopeYards: number,
  elevFt: number,
): number {
  const sea = seaLevelYards(segmentYards, elevFt);
  const frac = holeYards > 0 ? segmentYards / holeYards : 1;
  return Math.max(1, Math.round(sea + windAdjYards * frac + slopeYards * frac));
}

export interface MeasureSplit {
  carryYards: number;
  remainYards: number;
  target: LonLat;
}

export function measureFromTee(hole: GolfHole, target: LonLat): MeasureSplit {
  return {
    carryYards: Math.round(
      haversineYards(hole.tee.lat, hole.tee.lon, target.lat, target.lon),
    ),
    remainYards: Math.round(
      haversineYards(target.lat, target.lon, hole.green.lat, hole.green.lon),
    ),
    target,
  };
}

export function holePath(hole: GolfHole): LonLat[] {
  if (hole.path && hole.path.length >= 2) {
    return hole.path.map((p) => ({ lon: p.lon, lat: p.lat }));
  }
  return [
    { lon: hole.tee.lon, lat: hole.tee.lat },
    { lon: hole.green.lon, lat: hole.green.lat },
  ];
}

export function pointAlongHole(hole: GolfHole, yards: number): LonLat {
  const pts = holePath(hole);
  let remaining = Math.max(0, yards);
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = haversineYards(a.lat, a.lon, b.lat, b.lon);
    if (seg <= 0) continue;
    if (remaining <= seg || i === pts.length - 1) {
      const t = Math.min(1, remaining / seg);
      return {
        lon: a.lon + (b.lon - a.lon) * t,
        lat: a.lat + (b.lat - a.lat) * t,
      };
    }
    remaining -= seg;
  }
  return pts[pts.length - 1]!;
}

/** Par 3s aim at the green; longer holes open on a typical tee-shot landing. */
export function defaultTarget(hole: GolfHole, driverYards: number): LonLat {
  if ((hole.par ?? 4) <= 3 || hole.yards <= driverYards * 0.85) {
    return { lon: hole.green.lon, lat: hole.green.lat };
  }
  return pointAlongHole(hole, Math.min(driverYards, hole.yards * 0.62));
}

export function nearestBagClub(yards: number, bag: BagClub[]): BagClub | null {
  if (!bag.length) return null;
  return bag.reduce((best, club) =>
    Math.abs(club.yards - yards) < Math.abs(best.yards - yards) ? club : best,
  );
}

const ARC_KEYS = new Set(['dr', '3w', '5w', '7i', 'pw']);

export function bagArcClubs(bag: BagClub[]): BagClub[] {
  const picked = bag.filter((c) => ARC_KEYS.has(c.key));
  return picked.length ? picked : bag.filter((_, i) => i % 2 === 0).slice(0, 5);
}

function ringCoordinates(center: LonLat, yards: number, steps = 64): Array<[number, number]> {
  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const pt = destPoint(center, (i / steps) * 360, yards);
    ring.push([pt.lon, pt.lat]);
  }
  return ring;
}

export function bagRingsGeoJSON(
  tee: LonLat | null,
  clubs: BagClub[],
): GeoJSON.FeatureCollection {
  if (!tee) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: clubs.map((club) => ({
      type: 'Feature' as const,
      properties: { label: club.label, yards: club.yards },
      geometry: {
        type: 'LineString' as const,
        coordinates: ringCoordinates(tee, club.yards),
      },
    })),
  };
}

export function targetLineGeoJSON(
  tee: LonLat | null,
  target: LonLat | null,
  green: LonLat | null,
  mode: 'tee' | 'approach' = 'tee',
): GeoJSON.FeatureCollection {
  if (!target || !green) {
    return { type: 'FeatureCollection', features: [] };
  }
  if (mode === 'approach') {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { kind: 'remain' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [target.lon, target.lat],
              [green.lon, green.lat],
            ],
          },
        },
      ],
    };
  }
  if (!tee) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'carry' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [tee.lon, tee.lat],
            [target.lon, target.lat],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { kind: 'remain' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [target.lon, target.lat],
            [green.lon, green.lat],
          ],
        },
      },
    ],
  };
}

export function targetPointGeoJSON(target: LonLat | null): GeoJSON.FeatureCollection {
  if (!target) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'target' },
        geometry: { type: 'Point', coordinates: [target.lon, target.lat] },
      },
    ],
  };
}

export interface GreenMarks {
  front: LonLat;
  mid: LonLat;
  back: LonLat;
  /** Half-depth used for front/back offset, yards. */
  halfDepthYd: number;
}

export interface GreenDistances {
  front: number;
  mid: number;
  back: number;
}

/** Front / mid / back of green along the approach axis (tee → green). */
export function greenMarks(hole: GolfHole, halfDepthYd = 15): GreenMarks {
  const mid: LonLat = { lon: hole.green.lon, lat: hole.green.lat };
  const approachBearing = hole.bearingDeg;
  const front = destPoint(mid, (approachBearing + 180) % 360, halfDepthYd);
  const back = destPoint(mid, approachBearing, halfDepthYd);
  return { front, mid, back, halfDepthYd };
}

export function distancesToGreen(
  from: LonLat,
  marks: GreenMarks,
): GreenDistances {
  return {
    front: Math.round(
      haversineYards(from.lat, from.lon, marks.front.lat, marks.front.lon),
    ),
    mid: Math.round(
      haversineYards(from.lat, from.lon, marks.mid.lat, marks.mid.lon),
    ),
    back: Math.round(
      haversineYards(from.lat, from.lon, marks.back.lat, marks.back.lon),
    ),
  };
}

/** GPS → front / mid / back guide lines with yardage (+ optional club) labels. */
export function gpsGuideGeoJSON(
  from: LonLat | null,
  hole: GolfHole | null,
  opts?: { midClub?: string | null; maxYards?: number },
): GeoJSON.FeatureCollection {
  if (!from || !hole) return { type: 'FeatureCollection', features: [] };
  const marks = greenMarks(hole);
  const dist = distancesToGreen(from, marks);
  const maxYd = opts?.maxYards ?? 700;
  if (dist.mid > maxYd) return { type: 'FeatureCollection', features: [] };

  const features: GeoJSON.Feature[] = [];
  const rows: Array<{ key: string; pt: LonLat; yards: number; club?: string }> = [
    { key: 'F', pt: marks.front, yards: dist.front },
    {
      key: 'M',
      pt: marks.mid,
      yards: dist.mid,
      club: opts?.midClub ?? undefined,
    },
    { key: 'B', pt: marks.back, yards: dist.back },
  ];

  for (const row of rows) {
    features.push({
      type: 'Feature',
      properties: {
        kind: 'guide',
        role: row.key,
        label: row.key,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lon, from.lat],
          [row.pt.lon, row.pt.lat],
        ],
      },
    });
    const midLon = (from.lon + row.pt.lon) / 2;
    const midLat = (from.lat + row.pt.lat) / 2;
    const text =
      row.key === 'M' && row.club
        ? `${row.club} · ${row.yards} yd`
        : `${row.key} ${row.yards}`;
    features.push({
      type: 'Feature',
      properties: {
        kind: 'guide-label',
        role: row.key,
        label: text,
      },
      geometry: {
        type: 'Point',
        coordinates: [midLon, midLat],
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function greenMarksGeoJSON(
  marks: GreenMarks | null,
): GeoJSON.FeatureCollection {
  if (!marks) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: (
      [
        ['F', marks.front],
        ['M', marks.mid],
        ['B', marks.back],
      ] as const
    ).map(([label, pt]) => ({
      type: 'Feature' as const,
      properties: { label },
      geometry: {
        type: 'Point' as const,
        coordinates: [pt.lon, pt.lat],
      },
    })),
  };
}
