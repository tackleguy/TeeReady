/**
 * Batch-test ~300 courses: holes API + durable asset backups.
 *
 * Checks per course:
 *   - Holes handler (in-process, unique IP per request)
 *   - Static hole pack (/public/golf/holes/{slug}.json)
 *   - OSM map backup (/public/golf/osm/{slug}.json)
 *   - 3D green mesh (/public/golf/greens/{slug}.json)
 *   - Scorecard pack (Tier-1 venues only)
 *
 * Usage:
 *   npx tsx scripts/batch-test-holes.ts
 *   COURSE_COUNT=300 CONCURRENCY=3 npx tsx scripts/batch-test-holes.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from '../api/golf/holes';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = Number(process.env.COURSE_COUNT || 300);
const CONCURRENCY = Number(process.env.CONCURRENCY || 3);
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 30_000);
const MATCH_M = 1_400;

const greens = JSON.parse(
  readFileSync(join(ROOT, 'public/golf/greens/manifest.json'), 'utf8'),
) as {
  courses: Array<{
    slug: string;
    name: string;
    lat: number;
    lon: number;
    holes?: number;
  }>;
};
const holesManifest = JSON.parse(
  readFileSync(join(ROOT, 'public/golf/holes/manifest.json'), 'utf8'),
) as {
  courses: Array<{ slug: string; name: string; lat: number; lon: number }>;
};
const osmManifest = JSON.parse(
  readFileSync(join(ROOT, 'public/golf/osm/manifest.json'), 'utf8'),
) as {
  courses: Array<{ slug: string; name: string; lat: number; lon: number }>;
};
const scorecardManifest = existsSync(
  join(ROOT, 'public/golf/scorecards/manifest.json'),
)
  ? (JSON.parse(
      readFileSync(join(ROOT, 'public/golf/scorecards/manifest.json'), 'utf8'),
    ) as {
      courses: Array<{ slug: string; name: string }>;
    })
  : { courses: [] };
const tier1 = existsSync(join(ROOT, 'src/data/venues.scorecards.json'))
  ? (JSON.parse(
      readFileSync(join(ROOT, 'src/data/venues.scorecards.json'), 'utf8'),
    ) as Array<{ name: string; loop?: string | null }>)
  : [];
const catalog = JSON.parse(
  readFileSync(join(ROOT, 'api/golf/_data/usCatalog.json'), 'utf8'),
) as Array<{ n: string; la: number; lo: number }>;

type Course = {
  name: string;
  lat: number;
  lon: number;
  source: 'greens' | 'catalog';
  slug?: string;
};

type AssetStatus = {
  slug: string | null;
  greenFile: boolean;
  greenHoles: number;
  holePackFile: boolean;
  holePackCount: number;
  holePackComplete: boolean;
  osmFile: boolean;
  osmElements: number;
  scorecardFile: boolean;
  inGreensManifest: boolean;
  inHolesManifest: boolean;
  inOsmManifest: boolean;
};

type Result = {
  name: string;
  source: string;
  slug: string | null;
  status: number;
  ms: number;
  count: number;
  scope: string | null;
  error: string | null;
  ok: boolean;
  lines: boolean;
  complete: boolean;
  assets: AssetStatus;
  failures: string[];
  pass: boolean;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

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

function matchSlugFromManifest(
  courses: Array<{ slug: string; name: string; lat: number; lon: number }>,
  course: Course,
): string | null {
  const n = course.name.toLowerCase().trim();
  const exact = courses.find((c) => c.name.toLowerCase() === n);
  if (exact) return exact.slug;
  const partial = courses.find(
    (c) => n.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(n),
  );
  if (partial) return partial.slug;
  let best: (typeof courses)[0] | null = null;
  let bestD = Infinity;
  for (const c of courses) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const d = haversineM(course.lat, course.lon, c.lat, c.lon);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best && bestD <= MATCH_M ? best.slug : null;
}

function resolveSlug(course: Course): string | null {
  if (course.slug) return course.slug;
  return (
    matchSlugFromManifest(greens.courses ?? [], course) ??
    matchSlugFromManifest(holesManifest.courses ?? [], course) ??
    matchSlugFromManifest(osmManifest.courses ?? [], course)
  );
}

function isCompleteLayout(count: number): boolean {
  return count === 9 || count === 18;
}

function readJsonSafe<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function checkAssets(course: Course): AssetStatus {
  const slug = resolveSlug(course);
  const greenPath = slug
    ? join(ROOT, 'public/golf/greens', `${slug}.json`)
    : null;
  const holesPath = slug
    ? join(ROOT, 'public/golf/holes', `${slug}.json`)
    : null;
  const osmPath = slug ? join(ROOT, 'public/golf/osm', `${slug}.json`) : null;

  let greenHoles = 0;
  if (greenPath && existsSync(greenPath)) {
    const data = readJsonSafe<{ greens?: unknown[] }>(greenPath);
    greenHoles = data?.greens?.length ?? 0;
  }

  let holePackCount = 0;
  let holePackComplete = false;
  if (holesPath && existsSync(holesPath)) {
    const data = readJsonSafe<{ holes?: Array<{ number: number }> }>(holesPath);
    const holes = data?.holes ?? [];
    holePackCount = holes.length;
    if (isCompleteLayout(holePackCount)) {
      const nums = holes.map((h) => h.number).filter(Number.isFinite);
      holePackComplete = true;
      for (let n = 1; n <= holePackCount; n++) {
        if (!nums.includes(n)) {
          holePackComplete = false;
          break;
        }
      }
    }
  }

  let osmElements = 0;
  if (osmPath && existsSync(osmPath)) {
    const data = readJsonSafe<{ elements?: unknown[] }>(osmPath);
    osmElements = data?.elements?.length ?? 0;
  }

  const tier1Names = new Set(
    tier1.map((t) => t.name.toLowerCase().trim()),
  );
  let scorecardFile = false;
  if (tier1Names.has(course.name.toLowerCase().trim())) {
    const scSlug =
      matchSlugFromManifest(scorecardManifest.courses ?? [], course) ??
      slugify(course.name);
    scorecardFile = existsSync(
      join(ROOT, 'public/golf/scorecards', `${scSlug}.json`),
    );
  }

  return {
    slug,
    greenFile: Boolean(greenPath && existsSync(greenPath)),
    greenHoles,
    holePackFile: Boolean(holesPath && existsSync(holesPath)),
    holePackCount,
    holePackComplete,
    osmFile: Boolean(osmPath && existsSync(osmPath)),
    osmElements,
    scorecardFile,
    inGreensManifest: Boolean(
      slug && greens.courses?.some((c) => c.slug === slug),
    ),
    inHolesManifest: Boolean(
      slug && holesManifest.courses?.some((c) => c.slug === slug),
    ),
    inOsmManifest: Boolean(
      slug && osmManifest.courses?.some((c) => c.slug === slug),
    ),
  };
}

function classifyFailures(
  course: Course,
  api: Pick<
    Result,
    'ok' | 'lines' | 'complete' | 'count' | 'status' | 'error'
  >,
  assets: AssetStatus,
): string[] {
  const failures: string[] = [];

  if (assets.inGreensManifest && !assets.greenFile) {
    failures.push('manifest_green_no_file');
  }
  if (assets.greenFile && !isCompleteLayout(assets.greenHoles)) {
    failures.push('invalid_green_mesh');
  }
  if (assets.inHolesManifest && !assets.holePackFile) {
    failures.push('manifest_holes_no_file');
  }
  if (assets.holePackFile && !assets.holePackComplete) {
    failures.push('incomplete_hole_pack');
  }
  if (assets.inOsmManifest && !assets.osmFile) {
    failures.push('manifest_osm_no_file');
  }
  if (assets.osmFile && assets.osmElements === 0) {
    failures.push('empty_osm_backup');
  }

  if (api.status !== 200) {
    failures.push('holes_api_error');
  } else if (api.count === 0) {
    failures.push('holes_api_empty');
  } else if (!api.complete && !api.lines) {
    failures.push('holes_api_incomplete');
  }

  // Key outage scenario: live holes work but no durable static backup.
  if (api.ok && !assets.holePackComplete) {
    failures.push('api_ok_no_hole_backup');
  }
  if (course.source === 'greens' && api.ok && !assets.osmFile) {
    failures.push('greens_api_ok_no_osm_backup');
  }
  if (course.source === 'greens' && !assets.holePackComplete && !assets.osmFile) {
    failures.push('greens_no_durable_backup');
  }

  const tier1Names = new Set(
    tier1.map((t) => t.name.toLowerCase().trim()),
  );
  if (
    tier1Names.has(course.name.toLowerCase().trim()) &&
    !assets.scorecardFile
  ) {
    failures.push('missing_scorecard_pack');
  }

  return failures;
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCourseList(): Course[] {
  const out: Course[] = [];
  const seen = new Set<string>();

  for (const c of greens.courses ?? []) {
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
    const key = `${c.lat.toFixed(4)},${c.lon.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: c.name,
      lat: c.lat,
      lon: c.lon,
      source: 'greens',
      slug: c.slug,
    });
  }

  const rand = mulberry32(42);
  const shuffled = [...catalog].sort(() => rand() - 0.5);
  for (const e of shuffled) {
    if (out.length >= TARGET) break;
    if (!Number.isFinite(e.la) || !Number.isFinite(e.lo)) continue;
    const key = `${Number(e.la).toFixed(4)},${Number(e.lo).toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: e.n,
      lat: e.la,
      lon: e.lo,
      source: 'catalog',
    });
  }

  return out.slice(0, TARGET);
}

async function probe(course: Course, index: number): Promise<Result> {
  const assets = checkAssets(course);
  const params = new URLSearchParams({
    lat: String(course.lat),
    lon: String(course.lon),
    radius: '1800',
    v: '11',
    courseName: course.name,
  });
  const url = `http://local/api/golf/holes?${params}`;
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const req = new Request(url, {
      signal: ac.signal,
      headers: {
        'x-forwarded-for': `203.0.113.${(index % 250) + 1}`,
      },
    });
    const res = await handler(req);
    const body = (await res.json()) as {
      holes?: unknown[];
      count?: number;
      scope?: string;
      error?: string;
    };
    const count = Array.isArray(body.holes)
      ? body.holes.length
      : Number(body.count) || 0;
    const ok = res.ok && count > 0;
    const lines = res.ok && count >= 7;
    const complete = res.ok && isCompleteLayout(count);
    const base = {
      name: course.name,
      source: course.source,
      slug: assets.slug,
      status: res.status,
      ms: Date.now() - t0,
      count,
      scope: body.scope ?? null,
      error: body.error ?? (res.ok ? null : `http ${res.status}`),
      ok,
      lines,
      complete,
      assets,
    };
    const failures = classifyFailures(course, base, assets);
    return { ...base, failures, pass: failures.length === 0 };
  } catch (err) {
    const base = {
      name: course.name,
      source: course.source,
      slug: assets.slug,
      status: 0,
      ms: Date.now() - t0,
      count: 0,
      scope: null,
      error: err instanceof Error ? err.message : String(err),
      ok: false,
      lines: false,
      complete: false,
      assets,
    };
    const failures = classifyFailures(course, base, assets);
    return { ...base, failures, pass: false };
  } finally {
    clearTimeout(timer);
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i;
      i += 1;
      results[idx] = await fn(items[idx]!, idx);
      if ((idx + 1) % 20 === 0 || idx + 1 === items.length) {
        process.stderr.write(`… ${idx + 1}/${items.length}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

const courses = buildCourseList();
console.error(
  `Testing ${courses.length} courses in-process (concurrency=${CONCURRENCY})`,
);
console.error(
  `  greens=${courses.filter((c) => c.source === 'greens').length}` +
    ` catalog=${courses.filter((c) => c.source === 'catalog').length}`,
);

const results = await mapPool(courses, CONCURRENCY, (c, i) => probe(c, i));

const passed = results.filter((r) => r.pass);
const failed = results.filter((r) => !r.pass);

const failureBreakdown = failed.reduce<Record<string, number>>((acc, r) => {
  for (const f of r.failures) {
    acc[f] = (acc[f] || 0) + 1;
  }
  return acc;
}, {});

const bySource = (src: string) => {
  const subset = results.filter((r) => r.source === src);
  const pass = subset.filter((r) => r.pass).length;
  return `${pass}/${subset.length} pass (${
    subset.length ? Math.round((100 * pass) / subset.length) : 0
  }%)`;
};

const scopeCounts = results.reduce<Record<string, number>>((acc, r) => {
  const k = r.scope || (r.error ? 'error' : 'none');
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

const offlineReady = results.filter(
  (r) =>
    r.assets.holePackComplete ||
    (r.assets.osmFile && r.assets.osmElements > 0),
);
const liveReady = results.filter((r) => r.ok && (r.complete || r.lines));
const bugPattern = results.filter(
  (r) =>
    r.ok &&
    !r.assets.holePackComplete &&
    !(r.assets.osmFile && r.assets.osmElements > 0),
);

const summary = {
  tested: results.length,
  /** Strict: zero failure tags (includes transient Overpass errors). */
  passedStrict: passed.length,
  failedStrict: failed.length,
  pctPassStrict: Math.round((100 * passed.length) / results.length),
  /** Has durable hole pack and/or OSM backup on disk. */
  offlineReady: offlineReady.length,
  /** Live holes API returned ≥7 holes. */
  liveReady: liveReady.length,
  /** Live holes work but no static backup — the reported outage bug. */
  liveOkZeroBackup: bugPattern.length,
  withAnyHoles: results.filter((r) => r.ok).length,
  withCompleteHoles: results.filter((r) => r.complete).length,
  withHolePack: results.filter((r) => r.assets.holePackComplete).length,
  withOsmBackup: results.filter((r) => r.assets.osmFile && r.assets.osmElements > 0)
    .length,
  greensPass: bySource('greens'),
  catalogPass: bySource('catalog'),
  failureBreakdown: Object.fromEntries(
    Object.entries(failureBreakdown).sort((a, b) => b[1] - a[1]),
  ),
  scopes: Object.fromEntries(
    Object.entries(scopeCounts).sort((a, b) => b[1] - a[1]),
  ),
  medianMs: (() => {
    const ms = results.map((r) => r.ms).sort((a, b) => a - b);
    return ms[Math.floor(ms.length / 2)] ?? 0;
  })(),
  samplePassed: passed.slice(0, 10).map((r) => ({
    name: r.name,
    slug: r.slug,
    holes: r.count,
    holePack: r.assets.holePackComplete,
    osmBackup: r.assets.osmElements,
  })),
  sampleOfflineReady: offlineReady.slice(0, 10).map((r) => ({
    name: r.name,
    slug: r.slug,
    holePack: r.assets.holePackCount,
    osmElements: r.assets.osmElements,
    apiHoles: r.count,
  })),
  topFailures: failed
    .sort((a, b) => b.failures.length - a.failures.length)
    .slice(0, 40)
    .map((r) => ({
      name: r.name,
      slug: r.slug,
      source: r.source,
      failures: r.failures,
      apiHoles: r.count,
      holePack: r.assets.holePackCount,
      osmElements: r.assets.osmElements,
      error: r.error,
    })),
};

const cacheDir = join(ROOT, 'scripts/.cache');
mkdirSync(cacheDir, { recursive: true });
const outPath = join(cacheDir, 'batch-holes-results.json');
writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2));

console.log(JSON.stringify({ ...summary, resultsPath: outPath }, null, 2));
