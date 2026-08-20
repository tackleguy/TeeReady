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
