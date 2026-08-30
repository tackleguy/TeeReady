import { geodesicYards } from '../../../src/lib/geodesic';

export { geodesicYards };

/** WGS84 geodesic (Vincenty), yards. Name kept for callers. */
export function haversineYards(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return geodesicYards(aLat, aLon, bLat, bLon);
}

/** Initial bearing A→B, 0–360 true. */
export function bearingDeg(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(aLat);
  const phi2 = toRad(bLat);
  const dLambda = toRad(bLon - aLon);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function pathLengthYards(
  pts: Array<{ lat: number; lon: number }>,
): number {
  let sum = 0;
  for (let i = 1; i < pts.length; i++) {
    sum += haversineYards(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  }
  return sum;
}
