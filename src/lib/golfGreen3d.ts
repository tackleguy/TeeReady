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
      (n.includes('torrey pines') && n.includes('south')),
  },
  {
    slug: 'pebble-beach',
    test: (n) => n.includes('pebble beach golf links'),
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
