/** Pre-built 3D green meshes (OSM outline + USGS 3DEP elevation). */

/** CDN / local base for green mesh JSON (no trailing slash). */
function greensBaseUrl(): string {
  const raw = (import.meta.env as Record<string, string | undefined>)
    .VITE_GREENS_BASE_URL;
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || '/golf/greens';
}

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
    slug: 'augusta-national-golf-club',
    test: (n) =>
      n.includes('augusta national') && !n.includes('par 3') && !n.includes('par-3'),
  },
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
  {
    slug: 'spyglass-hill-golf-course',
    test: (n) => n.includes('spyglass hill'),
  },
  {
    slug: 'black-at-bethpage-state-park-golf-course',
    test: (n) => n.includes('bethpage') && n.includes('black'),
  },
  {
    slug: 'red-at-bethpage-state-park-golf-course',
    test: (n) => n.includes('bethpage') && n.includes('red'),
  },
  {
    slug: 'pinehurst-resort-country-club-no-2',
    test: (n) =>
      n.includes('pinehurst') &&
      (n.includes('no 2') || n.includes('no. 2') || n.includes('#2') || n.includes(' number 2')),
  },
  {
    slug: 'the-olympic-club-lake-course',
    test: (n) => n.includes('olympic') && n.includes('lake'),
  },
  {
    slug: 'shinnecock-hills-golf-course',
    test: (n) => n.includes('shinnecock'),
  },
  {
    slug: 'tpc-sawgrass-the-players-stadium-course',
    test: (n) =>
      (n.includes('sawgrass') && n.includes('stadium')) ||
      (n.includes('tpc sawgrass') && n.includes('players')),
  },
];

/** Disambiguate named candidates at multi-course facilities. */
const MATCH_NAME_M = 1200;
/**
 * Pure lat/lon match without a name hit. Keep tight — Florida / Phoenix
 * complexes pack unrelated courses inside ~1 km.
 */
const MATCH_COORD_M = 350;

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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Loose name match that still rejects short-name substring false positives. */
function namesLooselyMatch(courseName: string, packName: string): boolean {
  const a = courseName.toLowerCase().trim();
  const b = packName.toLowerCase().trim();
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  // Short labels ("12 Oaks", "Erin Hills") must match as a whole phrase.
  if (shorter.length < 14) {
    const re = new RegExp(
      `(^|[^a-z0-9])${escapeRegExp(shorter)}([^a-z0-9]|$)`,
    );
    return re.test(longer);
  }
  return longer.includes(shorter);
}

let manifestPromise: Promise<GreenMeshManifest | null> | null = null;

export function loadGreenMeshManifest(): Promise<GreenMeshManifest | null> {
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch(`${greensBaseUrl()}/manifest.json`)
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
      .filter((c) => namesLooselyMatch(n, c.name))
      .sort((a, b) => b.holes - a.holes || a.slug.localeCompare(b.slug));
    if (named.length === 1) return named[0]!.slug;
    if (named.length > 1 && lat != null && lon != null) {
      let best: GreenMeshManifestEntry | null = null;
      let bestScore = -Infinity;
      for (const c of named) {
        const d = haversineM(lat, lon, c.lat, c.lon);
        if (d > MATCH_NAME_M) continue;
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
      if (d > MATCH_COORD_M) continue;
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

/** True if this course has a mesh pack that actually loads. */
export async function courseHasGreenMeshes(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<boolean> {
  const slug = await resolveGreenMeshSlug(courseName, lat, lon);
  if (!slug) return false;
  const data = await loadGreenMeshCourse(slug);
  return (data?.greens?.length ?? 0) > 0;
}

const cache = new Map<string, Promise<GreenMeshCourse | null>>();

export function loadGreenMeshCourse(slug: string): Promise<GreenMeshCourse | null> {
  const hit = cache.get(slug);
  if (hit) return hit;
  const pending = fetch(`${greensBaseUrl()}/${slug}.json`)
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as GreenMeshCourse;
      if (!Array.isArray(data?.greens) || data.greens.length === 0) return null;
      return data;
    })
    .catch(() => null)
    .then((data) => {
      // Do not permanently cache misses — packs may land after a deploy.
      if (!data) cache.delete(slug);
      return data;
    });
  cache.set(slug, pending);
  return pending;
}

/** Exact hole mesh, or nearest hole number in the pack. */
export function pickGreenMesh(
  course: GreenMeshCourse | null | undefined,
  hole: number,
): GreenMesh | null {
  if (!course?.greens.length || !Number.isFinite(hole)) return null;
  const exact = course.greens.find((g) => g.hole === hole);
  if (exact) return exact;
  return course.greens.reduce((best, g) =>
    Math.abs(g.hole - hole) < Math.abs(best.hole - hole) ? g : best,
  );
}

/** Resolve + fetch a green pack so 3D toggle / map open is instant. */
export async function resolveAndWarmGreenMesh(
  courseName: string | undefined | null,
  lat?: number | null,
  lon?: number | null,
): Promise<void> {
  const slug = await resolveGreenMeshSlug(courseName, lat, lon);
  if (!slug) return;
  await loadGreenMeshCourse(slug);
}

/** Kick manifest fetch early (Courses map, prep, GPS). */
export function prefetchGreenMeshManifest(): void {
  void loadGreenMeshManifest();
}

function greenMeshRingLonLat(
  course: GreenMeshCourse,
  g: GreenMesh,
): Array<{ lon: number; lat: number }> {
  const scale = mPerDegree(course.lat);
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
  if (ring.length < 3) return [];
  return ring.map(([lon, lat]) => ({ lon, lat }));
}

/** Mapped green outline for front/center/back GPS ranging. */
export function greenRingLonLat(
  course: GreenMeshCourse | null,
  holeNumber: number | null,
): Array<{ lon: number; lat: number }> | null {
  if (!course || holeNumber == null) return null;
  const g = course.greens.find((x) => x.hole === holeNumber);
  if (!g) return null;
  const ring = greenMeshRingLonLat(course, g);
  return ring.length >= 3 ? ring : null;
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
