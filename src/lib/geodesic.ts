/**
 * WGS84 geodesic distance (Vincenty inverse) in yards.
 * Prefer this over spherical shortcuts for GPS ranging.
 */

const A = 6_378_137;
const F = 1 / 298.257_223_563;
const B = (1 - F) * A;
const YARDS_PER_M = 1.093_613_298_337_707_8;

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}

function sphericalYards(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6_371_000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, x))) * YARDS_PER_M;
}

/** Geodesic length between two WGS84 points, yards. */
export function geodesicYards(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLon) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLon)
  ) {
    return NaN;
  }
  if (aLat === bLat && aLon === bLon) return 0;

  const phi1 = toRad(aLat);
  const phi2 = toRad(bLat);
  const L = toRad(bLon - aLon);
  const U1 = Math.atan((1 - F) * Math.tan(phi1));
  const U2 = Math.atan((1 - F) * Math.tan(phi2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let lambda = L;
  let lambdaP = 2 * Math.PI;
  let cosSqAlpha = 0;
  let sinSigma = 0;
  let cosSigma = 0;
  let cos2SigmaM = 0;
  let sigma = 0;
  let iter = 0;

  do {
    iter += 1;
    const sinLambda = Math.sin(lambda);
    const cosLambda = Math.cos(lambda);
    sinSigma = Math.sqrt(
      (cosU2 * sinLambda) ** 2 +
        (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) ** 2,
    );
    if (sinSigma === 0) return 0;
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = (cosU1 * cosU2 * sinLambda) / sinSigma;
    cosSqAlpha = 1 - sinAlpha ** 2;
    cos2SigmaM =
      cosSqAlpha === 0 ? 0 : cosSigma - (2 * sinU1 * sinU2) / cosSqAlpha;
    const C = (F / 16) * cosSqAlpha * (2 + F * (4 - 3 * cosSqAlpha));
    lambdaP = lambda;
    lambda =
      L +
      (1 - C) *
        F *
        sinAlpha *
        (sigma +
          C *
            sinSigma *
            (cos2SigmaM +
              C * cosSigma * (-1 + 2 * cos2SigmaM ** 2)));
  } while (Math.abs(lambda - lambdaP) > 1e-12 && iter < 100);

  if (iter >= 100) return sphericalYards(aLat, aLon, bLat, bLon);

  const uSq = (cosSqAlpha * (A ** 2 - B ** 2)) / B ** 2;
  const Acoef =
    1 + (uSq / 16384) * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)));
  const Bcoef = (uSq / 1024) * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)));
  const deltaSigma =
    Bcoef *
    sinSigma *
    (cos2SigmaM +
      (Bcoef / 4) *
        (cosSigma * (-1 + 2 * cos2SigmaM ** 2) -
          (Bcoef / 6) *
            cos2SigmaM *
            (-3 + 4 * sinSigma ** 2) *
            (-3 + 4 * cos2SigmaM ** 2)));
  const metres = B * Acoef * (sigma - deltaSigma);
  return metres * YARDS_PER_M;
}

export function geodesicMiles(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  return geodesicYards(aLat, aLon, bLat, bLon) / 1760;
}
