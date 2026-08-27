#!/usr/bin/env node
/**
 * Build durable course asset packs so Prep/GPS open instantly without OSM.
 *
 * Writes:
 *   public/golf/holes/{slug}.json   — hole geometry (+ scorecard fields when API has them)
 *   public/golf/holes/manifest.json
 *   public/golf/scorecards/{slug}.json + manifest — Tier-1 official cards
 *
 * Also regenerates public/golf/greens/manifest.json from files that actually exist
 * (fixes stale manifest entries that advertise greens with no backup on disk).
 *
 * Usage:
 *   node scripts/build-course-asset-packs.mjs --limit=5
 *   node scripts/build-course-asset-packs.mjs --skip-existing
 *   node scripts/build-course-asset-packs.mjs --only=torrey-pines-south
 *   node scripts/build-course-asset-packs.mjs --dry-run
 *   node scripts/build-course-asset-packs.mjs --manifest-only
 *   node scripts/build-course-asset-packs.mjs --scorecards-only
 *
 * Env:
 *   HOLES_API_BASE  default https://tee-ready.vercel.app
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GREENS_DIR = join(ROOT, 'public/golf/greens');
const HOLES_DIR = join(ROOT, 'public/golf/holes');
const SCORECARDS_DIR = join(ROOT, 'public/golf/scorecards');
const VENUES_COURSES = join(ROOT, 'src/data/venues.courses.json');
const VENUES_SCORECARDS = join(ROOT, 'src/data/venues.scorecards.json');
const API_BASE = (
  process.env.HOLES_API_BASE || 'https://tee-ready.vercel.app'
).replace(/\/+$/, '');
const UA = 'TeeReady/1.0 (course-asset-pack-builder)';
const GREEN_MATCH_M = 250;
const MIN_HOLES = 9;

function parseArgs(argv) {
  const flags = new Set();
  const only = [];
  let limit = Infinity;
  let concurrency = 2;
  for (const a of argv) {
    if (a === '--skip-existing') flags.add('skip-existing');
    else if (a === '--force') flags.add('force');
    else if (a === '--dry-run') flags.add('dry-run');
    else if (a === '--manifest-only') flags.add('manifest-only');
    else if (a === '--scorecards-only') flags.add('scorecards-only');
    else if (a === '--holes-only') flags.add('holes-only');
    else if (a.startsWith('--limit=')) limit = Number(a.slice(8)) || limit;
    else if (a.startsWith('--concurrency='))
      concurrency = Math.max(1, Number(a.slice(14)) || concurrency);
    else if (a.startsWith('--only=')) only.push(a.slice(7));
    else if (!a.startsWith('-')) only.push(a);
  }
  return { flags, only, limit, concurrency };
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function haversineM(aLat, aLon, bLat, bLon) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data));
}

function compactHole(h) {
  const out = {
    number: h.number,
    yards: h.yards,
    bearingDeg: h.bearingDeg,
    tee: h.tee,
    green: h.green,
    source: h.source || 'hole-way',
  };
  if (h.name) out.name = h.name;
  if (h.par != null) out.par = h.par;
  if (h.loop) out.loop = h.loop;
  if (h.strokeIndex != null) out.strokeIndex = h.strokeIndex;
  if (h.provenance) out.provenance = h.provenance;
  if (h.teeElevationM != null) out.teeElevationM = h.teeElevationM;
  if (h.greenElevationM != null) out.greenElevationM = h.greenElevationM;
  if (Array.isArray(h.path) && h.path.length >= 2) {
    // Keep full path — overlays need the dogleg shape.
    out.path = h.path;
  }
  if (Array.isArray(h.tees) && h.tees.length) {
    out.tees = h.tees.map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      yards: t.yards,
      bearingDeg: t.bearingDeg,
      tee: t.tee,
      ...(t.color ? { color: t.color } : {}),
      ...(t.path?.length ? { path: t.path } : {}),
      ...(t.teeElevationM != null ? { teeElevationM: t.teeElevationM } : {}),
    }));
  }
  return out;
}

function dedupeByHoleNumber(holes) {
  const best = new Map();
  for (const h of holes) {
    if (!Number.isFinite(h?.number)) continue;
    const prev = best.get(h.number);
    if (!prev) {
      best.set(h.number, h);
      continue;
    }
    // Prefer hole-way geometry and longer paths (better centerlines).
    const score = (x) =>
      (x.source === 'hole-way' ? 2 : 0) + (x.path?.length ?? 0) / 100;
    if (score(h) > score(prev)) best.set(h.number, h);
  }
  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, h]) => h);
}

function preferCompleteLayout(holes) {
  if (isCompleteLayout(holes)) return holes;
  const byLoop = new Map();
  for (const h of holes) {
    const key = h.loop || '_';
    if (!byLoop.has(key)) byLoop.set(key, []);
    byLoop.get(key).push(h);
  }
  /** Prefer named loops over the catch-all. */
  const keys = [...byLoop.keys()].sort((a, b) => {
    if (a === '_') return 1;
    if (b === '_') return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) {
    const deduped = dedupeByHoleNumber(byLoop.get(key));
    if (isCompleteLayout(deduped)) return deduped;
  }
  const all = dedupeByHoleNumber(holes);
  if (isCompleteLayout(all)) return all;
  return holes;
}

function filterHolesToMesh(holes, mesh) {
  if (!mesh?.greens?.length) return preferCompleteLayout(holes);

  const matched = [];
  for (const g of mesh.greens) {
    if (!Number.isFinite(g.hole)) continue;
    let best = null;
    let bestD = Infinity;
    for (const h of holes) {
      if (h.number !== g.hole) continue;
      if (!h.green || !Number.isFinite(h.green.lat) || !Number.isFinite(h.green.lon))
        continue;
      const d = haversineM(g.lat, g.lon, h.green.lat, h.green.lon);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    if (best && bestD <= GREEN_MATCH_M) matched.push(best);
  }

  if (matched.length === mesh.greens.length && isCompleteLayout(matched)) {
    return matched;
  }

  // Position-first: nearest OSM green to each mesh green, reusing hole number.
  const byPos = [];
  const used = new Set();
  for (const g of mesh.greens) {
    let best = null;
    let bestD = Infinity;
    let bestIdx = -1;
    holes.forEach((h, idx) => {
      if (used.has(idx)) return;
      if (!h.green || !Number.isFinite(h.green.lat) || !Number.isFinite(h.green.lon))
        return;
      const d = haversineM(g.lat, g.lon, h.green.lat, h.green.lon);
      if (d < bestD) {
        bestD = d;
        best = h;
        bestIdx = idx;
      }
    });
    if (best && bestD <= GREEN_MATCH_M) {
      used.add(bestIdx);
      byPos.push({ ...best, number: g.hole });
    }
  }
  if (byPos.length === mesh.greens.length && isCompleteLayout(byPos)) {
    return byPos;
  }

  if (matched.length >= MIN_HOLES && isCompleteLayout(matched)) return matched;
  return preferCompleteLayout(holes);
}

function isCompleteLayout(holes) {
  if (!holes?.length) return false;
  const nums = holes.map((h) => h.number).filter((n) => Number.isFinite(n));
  if (nums.length !== 9 && nums.length !== 18) return false;
  const target = nums.length;
  for (let n = 1; n <= target; n++) {
    if (!nums.includes(n)) return false;
  }
  return true;
}

async function fetchHoles(course, { retries = 4 } = {}) {
  const params = new URLSearchParams({
    lat: String(course.lat),
    lon: String(course.lon),
    v: '11',
    radius: String(course.radiusM ?? 2200),
  });
  if (course.name) params.set('courseName', course.name);
  const url = `${API_BASE}/api/golf/holes?${params}`;
  let lastErr = null;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        lastErr = new Error(
          `holes ${res.status}${detail ? `: ${detail.slice(0, 120)}` : ''}`,
        );
        // Back off harder on 429/5xx — Overpass mirrors flap constantly.
        const wait = res.status === 429 ? 8_000 : 3_000;
        await sleep(wait * (attempt + 1) + Math.random() * 1000);
        continue;
      }
      const data = await res.json();
      return Array.isArray(data.holes) ? data.holes : [];
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(3_000 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error('holes fetch failed');
}

function loadGreenCourses() {
  if (!existsSync(GREENS_DIR)) return [];
  const files = readdirSync(GREENS_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  /** @type {Array<{ slug: string; name: string; lat: number; lon: number; holes: number; radiusM: number; mesh: object }>} */
  const out = [];
  for (const f of files) {
    try {
      const mesh = readJson(join(GREENS_DIR, f));
      const greens = mesh.greens ?? [];
      if (greens.length !== 9 && greens.length !== 18) continue;
      out.push({
        slug: mesh.id || f.replace(/\.json$/, ''),
        name: mesh.name,
        lat: mesh.lat,
        lon: mesh.lon,
        holes: greens.length,
        radiusM: 2200,
        mesh,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

function loadVenueCourses() {
  if (!existsSync(VENUES_COURSES)) return [];
  try {
    const rows = readJson(VENUES_COURSES);
    return rows
      .filter((r) => r?.kind === 'course' && r.center)
      .map((r) => ({
        slug: r.slug || slugify(r.name),
        name: r.name,
        lat: r.center.lat,
        lon: r.center.lon,
        holes: r.holes,
        radiusM: 2200,
        mesh: null,
      }));
  } catch {
    return [];
  }
}

function mergeTargets({ only, limit }) {
  const bySlug = new Map();
  for (const c of loadGreenCourses()) bySlug.set(c.slug, c);
  // Venue rows fill gaps (name/coords) but greens win when both exist.
  for (const c of loadVenueCourses()) {
    if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
  }
  let list = [...bySlug.values()];
  if (only.length) {
    const want = new Set(only.map((s) => s.toLowerCase()));
    list = list.filter(
      (c) =>
        want.has(c.slug.toLowerCase()) ||
        want.has(slugify(c.name)) ||
        [...want].some((w) => c.name.toLowerCase().includes(w)),
    );
  }
  list.sort((a, b) => a.name.localeCompare(b.name));
  if (Number.isFinite(limit) && list.length > limit) list = list.slice(0, limit);
  return list;
}

function writeHolesManifest() {
  mkdirSync(HOLES_DIR, { recursive: true });
  const files = readdirSync(HOLES_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const courses = [];
  for (const f of files) {
    try {
      const data = readJson(join(HOLES_DIR, f));
      const holes = data.holes ?? [];
      if (!isCompleteLayout(holes)) continue;
      courses.push({
        slug: data.slug || f.replace(/\.json$/, ''),
        name: data.name,
        lat: data.lat,
        lon: data.lon,
        holes: holes.length,
        holeNumbers: holes.map((h) => h.number).sort((a, b) => a - b),
        provenance: data.provenance ?? holes[0]?.provenance ?? 'geometric',
        hasScorecard: Boolean(
          data.hasScorecard ||
            holes.some((h) => h.provenance === 'official' || h.strokeIndex != null),
        ),
        builtAt: data.builtAt,
      });
    } catch {
      /* skip */
    }
  }
  courses.sort((a, b) => a.name.localeCompare(b.name));
  const manifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    count: courses.length,
    courses,
  };
  writeJson(join(HOLES_DIR, 'manifest.json'), manifest);
  console.log(`Holes manifest: ${courses.length} → ${join(HOLES_DIR, 'manifest.json')}`);
  return manifest;
}

function writeGreensManifestFromDisk() {
  if (!existsSync(GREENS_DIR)) return null;
  const files = readdirSync(GREENS_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const entries = [];
  for (const f of files) {
    try {
      const data = readJson(join(GREENS_DIR, f));
      const greens = data?.greens ?? [];
      if (greens.length !== 9 && greens.length !== 18) continue;
      const holes = greens.map((g) => g.hole).filter((h) => Number.isFinite(h));
      let complete = true;
      for (let n = 1; n <= holes.length; n++) {
        if (!holes.includes(n)) {
          complete = false;
          break;
        }
      }
      if (!complete) continue;
      entries.push({
        slug: data.id || f.replace(/\.json$/, ''),
        name: data.name,
        lat: data.lat,
        lon: data.lon,
        holes: greens.length,
        holeNumbers: [...holes].sort((a, b) => a - b),
      });
    } catch {
      /* skip */
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const manifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    count: entries.length,
    courses: entries,
  };
  writeJson(join(GREENS_DIR, 'manifest.json'), manifest);
  console.log(
    `Greens manifest (disk-truth): ${entries.length} → ${join(GREENS_DIR, 'manifest.json')}`,
  );
  return manifest;
}

function scorecardSlug(card) {
  const base = card.loop
    ? `${card.name} ${card.loop}`
    : card.name;
  return slugify(base);
}

function writeScorecardPacks({ dryRun }) {
  mkdirSync(SCORECARDS_DIR, { recursive: true });
  if (!existsSync(VENUES_SCORECARDS)) {
    console.warn('No venues.scorecards.json — skipping scorecard packs');
    return { count: 0 };
  }
  const cards = readJson(VENUES_SCORECARDS);
  const courses = [];
  for (const card of cards) {
    const slug = scorecardSlug(card);
    const pack = {
      slug,
      name: card.name,
      loop: card.loop ?? null,
      aliases: card.aliases ?? [],
      totalPar: card.totalPar,
      holes: card.holes,
      source: 'official',
      builtAt: new Date().toISOString(),
    };
    const path = join(SCORECARDS_DIR, `${slug}.json`);
    if (!dryRun) writeJson(path, pack);
    courses.push({
      slug,
      name: card.name,
      loop: card.loop ?? null,
      aliases: card.aliases ?? [],
      holes: card.holes?.length ?? 0,
      totalPar: card.totalPar,
    });
    console.log(`${dryRun ? '[dry] ' : ''}scorecard ${slug}`);
  }
  courses.sort((a, b) => a.name.localeCompare(b.name));
  const manifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    count: courses.length,
    courses,
  };
  if (!dryRun) writeJson(join(SCORECARDS_DIR, 'manifest.json'), manifest);
  console.log(`Scorecard packs: ${courses.length}`);
  return manifest;
}

async function buildOne(course, { skipExisting, force, dryRun }) {
  const outPath = join(HOLES_DIR, `${course.slug}.json`);
  if (skipExisting && !force && existsSync(outPath)) {
    return { slug: course.slug, status: 'skipped' };
  }

  let holes = [];
  let source = 'api';
  try {
    holes = await fetchHoles(course);
    holes = filterHolesToMesh(holes, course.mesh);
  } catch (err) {
    return {
      slug: course.slug,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  if (!isCompleteLayout(holes)) {
    return {
      slug: course.slug,
      status: 'incomplete',
      count: holes.length,
      source,
    };
  }

  const pack = {
    version: 1,
    slug: course.slug,
    name: course.name,
    lat: course.lat,
    lon: course.lon,
    holes: holes.map(compactHole),
    count: holes.length,
    provenance: holes[0]?.provenance ?? 'geometric',
    hasScorecard: holes.some(
      (h) => h.provenance === 'official' || h.strokeIndex != null,
    ),
    source,
    attribution: '© OpenStreetMap contributors (ODbL)',
    builtAt: new Date().toISOString(),
  };

  if (!dryRun) {
    mkdirSync(HOLES_DIR, { recursive: true });
    writeJson(outPath, pack);
  }
  return {
    slug: course.slug,
    status: 'ok',
    count: pack.count,
    source,
    bytes: dryRun ? 0 : Buffer.byteLength(JSON.stringify(pack)),
  };
}

async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function main() {
  const { flags, only, limit, concurrency } = parseArgs(process.argv.slice(2));
  const dryRun = flags.has('dry-run');
  const skipExisting = flags.has('skip-existing') && !flags.has('force');

  // Always keep greens manifest honest — missing files were advertising holes
  // that could never load a 3D backup.
  if (!dryRun) writeGreensManifestFromDisk();

  if (flags.has('manifest-only')) {
    writeHolesManifest();
    if (!flags.has('holes-only')) writeScorecardPacks({ dryRun });
    return;
  }

  if (!flags.has('holes-only')) {
    writeScorecardPacks({ dryRun });
  }
  if (flags.has('scorecards-only')) return;

  const targets = mergeTargets({ only, limit });
  console.log(
    `Building hole packs for ${targets.length} courses` +
      ` (api=${API_BASE}, concurrency=${concurrency}` +
      `${dryRun ? ', dry-run' : ''}` +
      `${skipExisting ? ', skip-existing' : ''})`,
  );

  const results = await mapPool(targets, concurrency, async (course) => {
    const result = await buildOne(course, {
      skipExisting,
      force: flags.has('force'),
      dryRun,
    });
    const mark =
      result.status === 'ok'
        ? '✓'
        : result.status === 'skipped'
          ? '·'
          : result.status === 'incomplete'
            ? '~'
            : '✗';
    console.log(
      `${mark} ${course.slug} → ${result.status}` +
        (result.count != null ? ` (${result.count} holes, ${result.source})` : '') +
        (result.error ? ` — ${result.error}` : '') +
        (result.bytes ? ` ${Math.round(result.bytes / 1024)}KB` : ''),
    );
    // Be kind to Overpass behind the API.
    if (result.status === 'ok' || result.status === 'incomplete') await sleep(400);
    return result;
  });

  if (!dryRun) writeHolesManifest();

  const ok = results.filter((r) => r.status === 'ok').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const incomplete = results.filter((r) => r.status === 'incomplete').length;
  const failed = results.filter((r) => r.status === 'failed').length;
  console.log(
    `\nDone: ${ok} ok, ${skipped} skipped, ${incomplete} incomplete, ${failed} failed`,
  );
  if (failed > ok && ok === 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
