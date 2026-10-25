import type { GolfHole, MappedGolfSurface } from './golf';

/** Reuse shared polygons once. This runs only in the opened map, never course lists. */
export function mappedSurfacesGeoJSON(holes: GolfHole[]): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features = new Map<string, GeoJSON.Feature<GeoJSON.Polygon>>();
  const add = (kind: string, surface: MappedGolfSurface) => {
    const key = `${kind}:${surface.osmWayId}`;
    if (features.has(key)) return;
    features.set(key, {
      type: 'Feature', id: key,
      properties: { kind, osmWayId: surface.osmWayId },
      geometry: { type: 'Polygon', coordinates: [surface.ring.map(p => [p.lon, p.lat])] },
    });
  };
  for (const hole of holes) {
    const surfaces = hole.mappedSurfaces;
    if (!surfaces) continue;
    for (const fairway of surfaces.fairways) add('fairway', fairway);
    add('tee', surfaces.tee);
    add('green', surfaces.green);
  }
  return { type: 'FeatureCollection', features: [...features.values()] };
}
