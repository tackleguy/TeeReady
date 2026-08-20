// Geometry for the hole-by-hole wind overlay: streamlines showing where the
// wind pushes, plus the predicted shot path once the ball drifts with it.
//
// Sign convention matches /api/golf/ensemble: crosswindMph > 0 pushes the
// ball to the RIGHT of the tee→green line.

import type { GolfHole } from './golf';

const YARDS_PER_DEG_LAT = 121734;

export interface LonLat {
  lon: number;
  lat: number;
}

export function destPoint(
  origin: LonLat,
  bearingDeg: number,
  yards: number,
): LonLat {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (yards * Math.cos(rad)) / YARDS_PER_DEG_LAT;
  const dLon =
    (yards * Math.sin(rad)) /
    (YARDS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180));
  return { lon: origin.lon + dLon, lat: origin.lat + dLat };
}

function lerp(a: LonLat, b: LonLat, t: number): LonLat {
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
  };
}

type Feature = {
  type: 'Feature';
  properties: Record<string, string | number>;
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
};

function line(
  pts: LonLat[],
  properties: Record<string, string | number> = {},
): Feature {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'LineString',
      coordinates: pts.map((p) => [p.lon, p.lat] as [number, number]),
    },
  };
}

export function emptyCollection() {
  return { type: 'FeatureCollection' as const, features: [] as Feature[] };
}

/**
 * Streamlines drawn across the hole corridor in the direction the air is
 * moving, with a V arrowhead at each downwind end.
 */
export function windFlowGeoJSON(
  hole: GolfHole | null,
  windFromDeg: number | null | undefined,
  windMph: number | null | undefined,
) {
  if (!hole || windFromDeg == null || windMph == null) return emptyCollection();

  const toward = (windFromDeg + 180) % 360;
  const tee: LonLat = { lon: hole.tee.lon, lat: hole.tee.lat };
  const green: LonLat = { lon: hole.green.lon, lat: hole.green.lat };

  // Longer, denser streaks when it is actually blowing.
  const streakYards = Math.min(240, Math.max(70, 55 + windMph * 7));
  const count = windMph < 3 ? 3 : windMph < 12 ? 5 : 7;
  const arrowYards = Math.max(10, streakYards * 0.09);

  const features: Feature[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    const axisPt = lerp(tee, green, t);
    // Push the start upwind so the streak sweeps across the hole corridor.
    const start = destPoint(axisPt, windFromDeg, streakYards * 0.5);
    const end = destPoint(start, toward, streakYards);
    features.push(line([start, end], { kind: 'flow', idx: i }));
    features.push(
      line([destPoint(end, toward + 150, arrowYards), end], {
        kind: 'arrow',
        idx: i,
      }),
      line([destPoint(end, toward - 150, arrowYards), end], {
        kind: 'arrow',
        idx: i,
      }),
    );
  }
  return { type: 'FeatureCollection' as const, features };
}

/**
 * Predicted ball path: straight aim line down the hole plus the curved track
 * the wind bends it onto. Drift grows with the square of distance flown.
 */
export function shotPathGeoJSON(
  hole: GolfHole | null,
  crosswindMph: number | null | undefined,
  headwindMph: number | null | undefined,
) {
  if (!hole || crosswindMph == null) return emptyCollection();

  const tee: LonLat = { lon: hole.tee.lon, lat: hole.tee.lat };
  const green: LonLat = { lon: hole.green.lon, lat: hole.green.lat };
  const axis = hole.bearingDeg;

  // ~10 mph cross over 200 yds ≈ 24 yds of drift.
  const driftYards = crosswindMph * (hole.yards / 100) * 1.2;
  // Into the wind the ball lands short of the pin on the same club.
  const carryScale = headwindMph
    ? Math.max(0.72, Math.min(1.18, 1 - headwindMph / 90))
    : 1;

  const steps = 24;
  const curve: LonLat[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const along = lerp(tee, green, t * carryScale);
    curve.push(destPoint(along, axis + 90, driftYards * t * t));
  }

  const landing = curve[curve.length - 1];
  const features: Feature[] = [
    line([tee, green], { kind: 'aim' }),
    line(curve, { kind: 'drift', drift: Math.round(driftYards) }),
    // Tick marking the wind-adjusted landing spot.
    line(
      [
        destPoint(landing, axis + 90, 8),
        destPoint(landing, axis - 90, 8),
      ],
      { kind: 'landing' },
    ),
  ];
  return { type: 'FeatureCollection' as const, features };
}
