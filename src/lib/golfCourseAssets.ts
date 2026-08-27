/**
 * Warm every durable course asset needed for a fast Prep/GPS open:
 * hole packs, satellite tiles, 3D greens, scorecards.
 */
import { warmSatelliteTiles } from './golfSatelliteCache';
import { resolveAndWarmGreenMesh, prefetchGreenMeshManifest } from './golfGreen3d';
import {
  resolveAndWarmHolePack,
  prefetchHolePackManifest,
} from './golfHolePacks';
import {
  resolveAndWarmScorecardPack,
  prefetchScorecardPackManifest,
} from './golfScorecardPacks';

export function prefetchCourseAssetManifests(): void {
  prefetchHolePackManifest();
  prefetchGreenMeshManifest();
  prefetchScorecardPackManifest();
}

export async function warmCourseAssets(opts: {
  name?: string | null;
  lat: number;
  lon: number;
  courseId?: string;
  loop?: string | null;
  priority?: 'high' | 'low';
}): Promise<void> {
  const { name, lat, lon, courseId, loop, priority = 'low' } = opts;
  warmSatelliteTiles(lat, lon, { courseId, priority });
  await Promise.all([
    resolveAndWarmHolePack(name, lat, lon),
    resolveAndWarmGreenMesh(name, lat, lon),
    resolveAndWarmScorecardPack(name, loop),
  ]);
}
