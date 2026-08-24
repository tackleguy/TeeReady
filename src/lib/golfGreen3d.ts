/** Pre-built 3D green meshes (OSM outline + USGS 3DEP elevation). */

export interface GreenMesh {
  hole: number;
  lat: number;
  lon: number;
  baseElevM: number;
  /** Local meters from course origin: [east, up, north] × vertex. */
  positions: number[];
  indices: number[];
}

export interface GreenMeshCourse {
  id: string;
  name: string;
  lat: number;
  lon: number;
  gridM: number;
  greens: GreenMesh[];
  builtAt?: string;
  source?: string;
}

const SLUGS: Array<{ slug: string; test: (name: string) => boolean }> = [
  {
    slug: 'torrey-pines-south',
    test: (n) =>
      n.includes('south at torrey') ||
      (n.includes('torrey pines') && n.includes('south')) ||
      (n.includes('torrey pines municipal') && n.includes('south')),
  },
  {
    slug: 'pebble-beach',
    test: (n) =>
      n.includes('pebble beach golf links') ||
      (n.includes('pebble beach') &&
        !n.includes('creek') &&
        !n.includes('cimarron')),
  },
];

export function greenMeshSlug(courseName: string | undefined | null): string | null {
  if (!courseName) return null;
  const n = courseName.toLowerCase();
  for (const { slug, test } of SLUGS) {
    if (test(n)) return slug;
  }
  return null;
}

export function hasGreenMeshes(courseName: string | undefined | null): boolean {
  return greenMeshSlug(courseName) != null;
}

const cache = new Map<string, Promise<GreenMeshCourse | null>>();

export function loadGreenMeshCourse(slug: string): Promise<GreenMeshCourse | null> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const pending = fetch(`/golf/greens/${slug}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<GreenMeshCourse>) : null))
    .catch(() => null);
  cache.set(slug, pending);
  return pending;
}

function mPerDegree(lat: number) {
  const latRad = (lat * Math.PI) / 180;
  return { mLat: 111_320, mLon: Math.max(1e-6, 111_320 * Math.cos(latRad)) };
}

/** Convex hull (lon/lat) of green mesh vertices for 2D contour overlays. */
export function greenContoursGeoJSON(
  course: GreenMeshCourse | null,
  activeHole: number | null,
): GeoJSON.FeatureCollection {
  if (!course?.greens.length) {
    return { type: 'FeatureCollection', features: [] };
  }
  const scale = mPerDegree(course.lat);
  const features: GeoJSON.Feature[] = [];

  for (const g of course.greens) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < g.positions.length; i += 3) {
      const x = g.positions[i]!;
      const z = g.positions[i + 2]!;
      pts.push([
        course.lon + x / scale.mLon,
        course.lat + z / scale.mLat,
      ]);
    }
    const ring = convexHull(pts);
    if (ring.length < 3) continue;
    if (
      ring[0]![0] !== ring[ring.length - 1]![0] ||
      ring[0]![1] !== ring[ring.length - 1]![1]
    ) {
      ring.push(ring[0]!);
    }
    features.push({
      type: 'Feature',
      properties: {
        hole: g.hole,
        active: activeHole === g.hole ? 1 : 0,
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  }

  return { type: 'FeatureCollection', features };
}

function cross(
  o: [number, number],
  a: [number, number],
  b: [number, number],
): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i]!;
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}
