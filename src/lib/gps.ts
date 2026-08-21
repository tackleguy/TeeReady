/** GPS helpers for the on-course GPS mod. */

export type GpsQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'none';

export function gpsQuality(accuracyM: number | null | undefined): GpsQuality {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return 'none';
  if (accuracyM <= 5) return 'excellent';
  if (accuracyM <= 12) return 'good';
  if (accuracyM <= 25) return 'fair';
  return 'poor';
}

export function gpsQualityLabel(q: GpsQuality): string {
  switch (q) {
    case 'excellent':
      return 'Excellent';
    case 'good':
      return 'Good';
    case 'fair':
      return 'Fair';
    case 'poor':
      return 'Poor';
    default:
      return 'No fix';
  }
}

export function gpsQualityColor(q: GpsQuality): string {
  switch (q) {
    case 'excellent':
      return '#22c55e';
    case 'good':
      return '#3b82f6';
    case 'fair':
      return '#d9a83a';
    case 'poor':
      return '#d9714f';
    default:
      return '#98a291';
  }
}

/** Approximate a geodesic circle as a GeoJSON polygon (meters). */
export function accuracyCircleGeoJSON(
  lat: number,
  lon: number,
  radiusM: number,
  steps = 48,
): GeoJSON.FeatureCollection {
  if (!(radiusM > 0) || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { type: 'FeatureCollection', features: [] };
  }
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLat = 111_320;
  const metersPerDegLon = 111_320 * Math.cos(latRad);
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const dLat = (radiusM * Math.cos(a)) / metersPerDegLat;
    const dLon = (radiusM * Math.sin(a)) / Math.max(1e-6, metersPerDegLon);
    coords.push([lon + dLon, lat + dLat]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { radiusM },
        geometry: { type: 'Polygon', coordinates: [coords] },
      },
    ],
  };
}

export function formatAccuracy(accuracyM: number | null | undefined): string {
  if (accuracyM == null || !Number.isFinite(accuracyM)) return '—';
  if (accuracyM < 10) return `±${accuracyM.toFixed(1)} m`;
  return `±${Math.round(accuracyM)} m`;
}

export function formatHeading(deg: number | null | undefined): string {
  if (deg == null || !Number.isFinite(deg)) return '—';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return `${dirs[idx]} ${Math.round(deg)}°`;
}
