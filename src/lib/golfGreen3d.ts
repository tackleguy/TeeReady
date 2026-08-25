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

export interface GreenMeshManifestEntry {
  slug: string;
  name: string;
  lat: number;
  lon: number;
  holes: number;
  holeNumbers?: number[];
}

export interface GreenMeshManifest {
  version: number;
  builtAt?: string;
  count: number;
  courses: GreenMeshManifestEntry[];
}

/** Legacy name matchers for curated packs (before lat/lon manifest). */
const SLUGS: Array<{ slug: string; test: (name: string) => boolean }> = [
  {
    slug: 'torrey-pines-south',
    test: (n) =>
      n.includes('south at torrey') ||
      (n.includes('torrey pines') && n.includes('south')),
  },
  {
    slug: 'torrey-pines-north',
    test: (n) =>
      n.includes('north at torrey') ||
      (n.includes('torrey pines') && n.includes('north')),
  },
  {
    // Prefer the full 18-hole pack over the truncated `pebble-beach.json`.
    slug: 'pebble-beach-golf-links',
    test: (n) =>
      n.includes('pebble beach golf links') ||
      (n.includes('pebble beach') &&
        !n.includes('creek') &&
        !n.includes('cimarron')),
  },
];

const MATCH_M = 1200;

function haversineM(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

let manifestPromise: Promise<GreenMeshManifest | null> | null = null;

export function loadGreenMeshManifest(): Promise<GreenMeshManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('/golf/greens/manifest.json')
    .then((res) => (res.ok ? (res.json() as Promise<GreenMeshManifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

function matchSlugFromManifest(
  manifest: GreenMeshManifest | null,
  courseName: string | null | undefined,
  lat?: number | null,
  lon?: number | null,
): string | null {
  if (!manifest?.courses?.length) return null;

  // Name match first when possible — avoids lat/lon collisions at multi-course
  // facilities (Sepulveda, Admirals Cove, Torrey, Pebble duplicates, etc.).
  if (courseName) {
    const n = courseName.toLowerCase().trim();
    const exact = manifest.courses.find((c) => c.name.toLowerCase() === n);
    if (exact) return exact.slug;

    const named = manifest.courses
      .filter(
        (c) =>
          n.includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(n),
      )
      .sort((a, b) => b.holes - a.holes || a.slug.localeCompare(b.slug));
    if (named.length === 1) return named[0]!.slug;
    if (named.length > 1 && lat != null && lon != null) {
      let best: GreenMeshManifestEntry | null = null;
      let bestScore = -Infinity;
      for (const c of named) {
        const d = haversineM(lat, lon, c.lat, c.lon);
        if (d > MATCH_M) continue;
        // Prefer closer packs, then more complete hole coverage.
        const score = -d + c.holes * 40;
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best) return best.slug;
    } else if (named.length > 1) {
      return named[0]!.slug;
    }
  }

  if (
    lat != null &&
    lon != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon)
  ) {
    let best: GreenMeshManifestEntry | null = null;
    let bestScore = -Infinity;
    for (const c of manifest.courses) {
      const d = haversineM(lat, lon, c.lat, c.lon);
      if (d > MATCH_M) continue;
      const score = -d + c.holes * 40;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (best) return best.slug;
  }

  return null;
}

function matchSlugLegacy(courseName: string | undefined | null): string | null {
  if (!courseName) return null;
  const n = courseName.toLowerCase();
  for (const { slug, test } of SLUGS) {
    if (test(n)) return slug;
  }
  return null;
}

/** Sync legacy fallback — prefer resolveGreenMeshSlug() when lat/lon available. */
export function greenMeshSlug(courseName: string | undefined | null): string | null {
  return matchSlugLegacy(courseName);
}

export async function resolveGreenMeshSlug(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<string | null> {
  const manifest = await loadGreenMeshManifest();
  return (
    matchSlugFromManifest(manifest, courseName, lat, lon) ??
    matchSlugLegacy(courseName)
  );
}

export function hasGreenMeshes(courseName: string | undefined | null): boolean {
  return greenMeshSlug(courseName) != null;
}

/** True if this course is in the mesh pack (manifest or legacy name). */
export async function courseHasGreenMeshes(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<boolean> {
  return (await resolveGreenMeshSlug(courseName, lat, lon)) != null;
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
