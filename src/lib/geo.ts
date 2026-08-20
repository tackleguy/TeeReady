// Geographic helpers shared across radar components.

export function haversineMiles(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613; // mean Earth radius, miles
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

export function milesToKm(miles: number): number {
  return miles * 1.60934;
}

// Initial bearing (true) from A to B. Returned as 0-360.
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
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

export function bearingCompass(deg: number): string {
  const dirs = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

// Format coordinates as "DD.dddd° N" / "DD.dddd° W". This is denser and
// more legible than the conventional °′″ notation at the precision we use.
export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

// Test whether a [lon, lat] is inside the bounding box of a polygon-ish
// geometry. Used by the click inspector to surface the alerts at the
// click point (cheap point-in-bbox check; good enough for the UI hint).
export function pointInBBox(
  point: [number, number],
  bbox: [number, number, number, number],
): boolean {
  const [lon, lat] = point;
  return (
    lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
  );
}

export function geometryBBox(
  geom: GeoJSON.Geometry | null,
): [number, number, number, number] | null {
  if (!geom) return null;
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  const visit = (g: GeoJSON.Geometry) => {
    if (g.type === 'Polygon') {
      for (const ring of g.coordinates)
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lat < minLat) minLat = lat;
          if (lon > maxLon) maxLon = lon;
          if (lat > maxLat) maxLat = lat;
        }
    } else if (g.type === 'MultiPolygon') {
      for (const poly of g.coordinates)
        for (const ring of poly)
          for (const [lon, lat] of ring) {
            if (lon < minLon) minLon = lon;
            if (lat < minLat) minLat = lat;
            if (lon > maxLon) maxLon = lon;
            if (lat > maxLat) maxLat = lat;
          }
    } else if (g.type === 'Point') {
      const [lon, lat] = g.coordinates as [number, number];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  };
  visit(geom);
  if (!isFinite(minLon)) return null;
  return [minLon, minLat, maxLon, maxLat];
}

// Mile / km readout that pretty-prints based on distance: feet for
// short, miles+decimal for medium, miles integer for far.
export function prettyDistance(miles: number): { miles: string; km: string } {
  let m: string;
  if (miles < 0.1) {
    m = `${Math.round(miles * 5280)} ft`;
  } else if (miles < 10) {
    m = `${miles.toFixed(2)} mi`;
  } else {
    m = `${Math.round(miles)} mi`;
  }
  const kmVal = milesToKm(miles);
  let km: string;
  if (kmVal < 0.5) km = `${Math.round(kmVal * 1000)} m`;
  else if (kmVal < 100) km = `${kmVal.toFixed(2)} km`;
  else km = `${Math.round(kmVal)} km`;
  return { miles: m, km };
}
