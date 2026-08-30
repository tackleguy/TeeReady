#!/usr/bin/env node
/**
 * Local OSM backup for server-failure fallback.
 *
 * Writes:
 *   public/golf/osm/{slug}.json      — filtered golf OSM elements (map API)
 *   public/golf/osm/manifest.json
 *   public/golf/holes/{slug}.json    — derived hole geometry (via holes API)
 *   public/golf/holes/manifest.json
 *   data/osm-backup/manifest.json    — inventory + paths (local index)
 *
 * Usage:
 *   node scripts/backup-osm-data.mjs
 *   node scripts/backup-osm-data.mjs --limit=10
 *   node scripts/backup-osm-data.mjs --skip-existing
 *   node scripts/backup-osm-data.mjs --osm-only
 *   node scripts/backup-osm-data.mjs --holes-only
 *   node scripts/backup-osm-data.mjs --only=pebble-beach-golf-links
 *   node scripts/backup-osm-data.mjs --from-catalog --missing-only --limit=300 --concurrency=8 --fast --goal=100 --deadline-ms=600000
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
  copyFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isNineCombinationArtifact } from './lib/catalogFixes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GREENS_DIR = join(ROOT, 'public/golf/greens');
const OSM_DIR = join(ROOT, 'public/golf/osm');
const HOLES_DIR = join(ROOT, 'public/golf/holes');
const DATA_DIR = join(ROOT, 'data/osm-backup');
const VENUES_COURSES = join(ROOT, 'src/data/venues.courses.json');
const CATALOG_PATH = join(ROOT, 'api/golf/_data/usCatalog.json');
const API_BASE = (
  process.env.HOLES_API_BASE || 'https://tee-ready.vercel.app'
).replace(/\/+$/, '');
const UA = 'TeeReady/1.0 (osm-backup; contact@teeready.app)';
const OSM_MAP_URLS = [
  'https://api.openstreetmap.org/api/0.6/map.json',
  'https://www.openstreetmap.org/api/0.6/map.json',
];
const MIN_HOLES = 9;

function parseArgs(argv) {
  const flags = new Set();
  const only = [];
  let limit = Infinity;
  let concurrency = 2;
  let goal = Infinity;
  let deadlineMs = 0;
  let shard = null;
  for (const a of argv) {
    if (a === '--skip-existing') flags.add('skip-existing');
    else if (a === '--force') flags.add('force');
    else if (a === '--dry-run') flags.add('dry-run');
    else if (a === '--osm-only') flags.add('osm-only');
    else if (a === '--holes-only') flags.add('holes-only');
    else if (a === '--from-catalog') flags.add('from-catalog');
    else if (a === '--missing-only') flags.add('missing-only');
    else if (a === '--needs-osm') flags.add('needs-osm');
    else if (a === '--needs-holes') flags.add('needs-holes');
    else if (a === '--from-osm-backups') flags.add('from-osm-backups');
    else if (a === '--fast') flags.add('fast');
    else if (a.startsWith('--limit=')) limit = Number(a.slice(8)) || limit;
    else if (a.startsWith('--goal=')) goal = Number(a.slice(7)) || goal;
    else if (a.startsWith('--deadline-ms='))
      deadlineMs = Number(a.slice(14)) || deadlineMs;
    else if (a.startsWith('--concurrency='))
      concurrency = Math.max(1, Number(a.slice(14)) || concurrency);
    else if (a.startsWith('--shard=')) {
      const m = a.slice(8).match(/^(\d+)\/(\d+)$/);
      if (m) shard = { index: Number(m[1]), total: Number(m[2]) };
    } else if (a.startsWith('--only=')) only.push(a.slice(7));
    else if (!a.startsWith('-')) only.push(a);
  }
  return { flags, only, limit, concurrency, goal, deadlineMs, shard };
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data));
}

function bboxFromLatLon(lat, lon, radiusM) {
  const latPad = Math.max(radiusM, 900) / 111_320;
  const lonPad =
    Math.max(radiusM, 900) /
    (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    south: lat - latPad,
    west: lon - lonPad,
    north: lat + latPad,
    east: lon + lonPad,
  };
}

function shrinkBbox(bbox, factor = 0.72) {
  const f = Math.min(Math.max(factor, 0.35), 0.95);
  const midLat = (bbox.south + bbox.north) / 2;
  const midLon = (bbox.west + bbox.east) / 2;
  const halfLat = ((bbox.north - bbox.south) / 2) * f;
  const halfLon = ((bbox.east - bbox.west) / 2) * f;
  return {
    south: midLat - halfLat,
    west: midLon - halfLon,
    north: midLat + halfLat,
    east: midLon + halfLon,
  };
}

function bboxQuery(bbox) {
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
}

/** Match api/golf/_lib/osmMap.ts reconstructGolfElements. */
function reconstructGolfElements(raw) {
  const keepNodeIds = new Set();
  const keepWayIds = new Set();
  for (const el of raw) {
    if (el.type !== 'way') continue;
    const tags = el.tags ?? {};
    if (!tags.golf && tags.leisure !== 'golf_course') continue;
    keepWayIds.add(el.id);
    for (const id of el.nodes ?? []) keepNodeIds.add(id);
  }

  const nodeById = new Map();
  for (const el of raw) {
    if (
      el.type === 'node' &&
      typeof el.lat === 'number' &&
      typeof el.lon === 'number' &&
      (keepNodeIds.has(el.id) || Boolean(el.tags?.golf))
    ) {
      nodeById.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const elements = [];
  for (const el of raw) {
    if (el.type === 'node') {
      if (!el.tags?.golf) continue;
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
      elements.push({
        type: 'node',
        id: el.id,
        lat: el.lat,
        lon: el.lon,
        tags: el.tags,
      });
      continue;
    }
    if (el.type !== 'way' || !keepWayIds.has(el.id)) continue;
    const geometry = (el.nodes ?? [])
      .map((id) => nodeById.get(id))
      .filter(Boolean);
    elements.push({
      type: 'way',
      id: el.id,
      nodes: el.nodes,
      tags: el.tags,
      geometry,
    });
  }
  return elements;
}

async function fetchOsmMap(bbox, { timeoutMs = 12_000, attempts = 2 } = {}) {
  let tooLarge = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const url = OSM_MAP_URLS[attempt % OSM_MAP_URLS.length];
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}?bbox=${bboxQuery(bbox)}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ac.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        if (
          res.status === 400 &&
          /too many nodes|smaller area|bbox/i.test(detail)
        ) {
          tooLarge = true;
          return { kind: 'too-large' };
        }
        continue;
      }
      const body = await res.json();
      return {
        kind: 'ok',
        elements: reconstructGolfElements(body.elements ?? []),
      };
    } catch {
      // next mirror
    } finally {
      clearTimeout(timer);
    }
  }
  return { kind: tooLarge ? 'too-large' : 'error' };
}

async function fetchOverpassGolf(bbox, { timeoutMs = 20_000 } = {}) {
  const query = `
[out:json][timeout:18];
(
  way["golf"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  node["golf"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
  way["leisure"="golf_course"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});
);
out geom;
`.trim();
  const pinned = process.env.OVERPASS_URL?.trim();
  const fromEnv = (process.env.OVERPASS_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const urls = pinned
    ? [pinned, ...fromEnv.filter((u) => u !== pinned)]
    : fromEnv.length
      ? fromEnv
      : [
          'https://overpass.kumi.systems/api/interpreter',
          'https://overpass.private.coffee/api/interpreter',
          'https://overpass-api.de/api/interpreter',
          'https://lz4.overpass-api.de/api/interpreter',
          'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
        ];
  let lastErr = null;
  for (const url of urls) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': UA,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: ac.signal,
      });
      if (!res.ok) {
        lastErr = new Error(`overpass ${res.status}`);
        await sleep(1_500);
        continue;
      }
      const body = await res.json();
      if (body.remark && /error|timed out|too (many|much)/i.test(body.remark)) {
        lastErr = new Error('overpass busy');
        await sleep(2_000);
        continue;
      }
      const elements = (body.elements ?? []).filter((el) => {
        if (el.type === 'node') return Boolean(el.tags?.golf);
        if (el.type === 'way') {
          return Boolean(el.tags?.golf) || el.tags?.leisure === 'golf_course';
        }
        return false;
      });
      return { kind: 'ok', elements, source: 'overpass' };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    kind: 'error',
    error: lastErr?.message ?? 'overpass failed',
  };
}

async function fetchOsmForCourse(course) {
  let box = bboxFromLatLon(course.lat, course.lon, course.radiusM ?? 2200);
  let lastError = 'OSM map fetch failed';
  // Keep map retries short — rate limits are common; Overpass is the backup.
  for (let shrink = 0; shrink < 4; shrink += 1) {
    const result = await fetchOsmMap(box, { timeoutMs: 10_000, attempts: 2 });
    if (result.kind === 'ok') {
      return { elements: result.elements, bbox: box, source: 'osm-map' };
    }
    if (result.kind === 'too-large') {
      box = shrinkBbox(box, 0.72);
      lastError = 'bbox too large';
      continue;
    }
    lastError = 'OSM map fetch failed';
    break;
  }

  // Map API rate-limited / down → Overpass golf extract for the same bbox.
  const overBox = bboxFromLatLon(course.lat, course.lon, Math.min(course.radiusM ?? 2200, 1800));
  const over = await fetchOverpassGolf(overBox);
  if (over.kind === 'ok' && over.elements.length) {
    return {
      elements: over.elements,
      bbox: overBox,
      source: 'overpass',
    };
  }
  if (over.kind === 'error') {
    lastError = `${lastError}; overpass: ${over.error}`;
  }
  throw new Error(lastError);
}

function haversineYards(lat1, lon1, lat2, lon2) {
  const R = 6_371_000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return (2 * R * Math.asin(Math.sqrt(A))) / 0.9144;
}

function pathLengthYards(geom) {
  let total = 0;
  for (let i = 0; i < geom.length - 1; i += 1) {
    total += haversineYards(
      geom[i].lat,
      geom[i].lon,
      geom[i + 1].lat,
      geom[i + 1].lon,
    );
  }
  return total;
}

function bearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

let deriveHolesFromOsmElements = null;
async function loadDeriveHoles() {
  if (!deriveHolesFromOsmElements) {
    const mod = await import('../api/golf/holes.ts');
    deriveHolesFromOsmElements = mod.deriveHolesFromOsmElements;
  }
  return deriveHolesFromOsmElements;
}

/** Derive hole packs from a local OSM backup (same logic as the holes API). */
async function holesFromLocalOsm(course) {
  const osmPath = join(OSM_DIR, `${course.slug}.json`);
  if (!existsSync(osmPath)) return [];
  try {
    const pack = readJson(osmPath);
    const elements = pack.elements ?? [];
    if (!elements.length) return [];
    const derive = await loadDeriveHoles();
    return derive(elements, { courseName: course.name }) ?? [];
  } catch {
    return [];
  }
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
  if (Array.isArray(h.path) && h.path.length >= 2) out.path = h.path;
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

function shardKey(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i += 1) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h;
}

function inShard(slug, shard) {
  if (!shard || shard.total < 1) return true;
  return shardKey(slug) % shard.total === shard.index;
}

function hasOsmPack(slug) {
  const p = join(OSM_DIR, `${slug}.json`);
  if (!existsSync(p)) return false;
  try {
    return (readJson(p).elements?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

function hasCompleteHolePack(slug) {
  const p = join(HOLES_DIR, `${slug}.json`);
  if (!existsSync(p)) return false;
  try {
    return isCompleteLayout(readJson(p).holes);
  } catch {
    return false;
  }
}

function isFullyLocalized(slug) {
  return hasOsmPack(slug) && hasCompleteHolePack(slug);
}

function loadCatalogCourses({ limit, missingOnly, needsOsm, needsHoles, shard }) {
  if (!existsSync(CATALOG_PATH)) return [];
  const cat = readJson(CATALOG_PATH);
  const seen = new Set();
  const out = [];
  const sorted = [...cat].sort((a, b) => {
    if ((b.q ?? 0) !== (a.q ?? 0)) return (b.q ?? 0) - (a.q ?? 0);
    if ((b.o ? 1 : 0) !== (a.o ? 1 : 0)) return (b.o ? 1 : 0) - (a.o ? 1 : 0);
    return String(a.n ?? '').localeCompare(String(b.n ?? ''));
  });
  for (const c of sorted) {
    if (out.length >= limit) break;
    if (c.la == null || c.lo == null) continue;
    if (c.h != null && c.h !== 9 && c.h !== 18) continue;
    if (c.st === 'HI') continue;
    if (isNineCombinationArtifact(c.n)) continue;
    const slug = slugify(c.n);
    if (!slug || seen.has(slug)) continue;
    if (!inShard(slug, shard)) continue;
    if (missingOnly && isFullyLocalized(slug)) continue;
    if (needsOsm && hasOsmPack(slug)) continue;
    if (needsHoles && hasCompleteHolePack(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      name: c.n,
      lat: c.la,
      lon: c.lo,
      holes: c.h ?? 18,
      radiusM: 2200,
    });
  }
  return out;
}

function loadGreenCourses() {
  if (!existsSync(GREENS_DIR)) return [];
  const files = readdirSync(GREENS_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const out = [];
  for (const f of files) {
    try {
      const mesh = readJson(join(GREENS_DIR, f));
      const greens = mesh.greens ?? [];
      if (greens.length < 9) continue;
      out.push({
        slug: mesh.id || f.replace(/\.json$/, ''),
        name: mesh.name,
        lat: mesh.lat,
        lon: mesh.lon,
        holes: greens.length,
        radiusM: 2200,
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
      }));
  } catch {
    return [];
  }
}

/** Existing OSM JSON on disk that still lacks a complete hole pack. */
function loadOsmNeedingHoles() {
  if (!existsSync(OSM_DIR)) return [];
  const out = [];
  for (const f of readdirSync(OSM_DIR)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    const slug = f.replace(/\.json$/, '');
    if (hasCompleteHolePack(slug)) continue;
    try {
      const data = readJson(join(OSM_DIR, f));
      if (!(data.elements?.length > 0)) continue;
      out.push({
        slug: data.slug || slug,
        name: data.name || slug,
        lat: data.lat,
        lon: data.lon,
        holes: 18,
        radiusM: 2200,
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

function mergeTargets({
  only,
  limit,
  fromCatalog,
  fromOsmBackups,
  missingOnly,
  needsOsm,
  needsHoles,
  shard,
}) {
  const bySlug = new Map();
  if (fromOsmBackups) {
    for (const c of loadOsmNeedingHoles()) {
      if (inShard(c.slug, shard)) bySlug.set(c.slug, c);
    }
  }
  if (fromCatalog) {
    for (const c of loadCatalogCourses({
      limit: Infinity,
      missingOnly,
      needsOsm,
      needsHoles,
      shard,
    }))
      bySlug.set(c.slug, c);
  } else {
    for (const c of loadGreenCourses()) bySlug.set(c.slug, c);
    for (const c of loadVenueCourses()) {
      if (!bySlug.has(c.slug)) bySlug.set(c.slug, c);
    }
    if (missingOnly || needsOsm || needsHoles) {
      for (const [slug] of [...bySlug.entries()]) {
        if (missingOnly && isFullyLocalized(slug)) bySlug.delete(slug);
        else if (needsOsm && hasOsmPack(slug)) bySlug.delete(slug);
        else if (needsHoles && hasCompleteHolePack(slug)) bySlug.delete(slug);
      }
    }
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

function writeOsmManifest() {
  mkdirSync(OSM_DIR, { recursive: true });
  const files = readdirSync(OSM_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const courses = [];
  for (const f of files) {
    try {
      const data = readJson(join(OSM_DIR, f));
      const elements = data.elements ?? [];
      if (!elements.length) continue;
      courses.push({
        slug: data.slug || f.replace(/\.json$/, ''),
        name: data.name,
        lat: data.lat,
        lon: data.lon,
        elementCount: elements.length,
        fetchedAt: data.fetchedAt,
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
  writeJson(join(OSM_DIR, 'manifest.json'), manifest);
  return manifest;
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
            holes.some(
              (h) => h.provenance === 'official' || h.strokeIndex != null,
            ),
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
  return manifest;
}

function writeDataIndex(osmManifest, holesManifest) {
  mkdirSync(DATA_DIR, { recursive: true });
  const index = {
    version: 1,
    builtAt: new Date().toISOString(),
    purpose:
      'Local OSM server-failure fallback. Runtime reads public/golf/osm + public/golf/holes.',
    osm: {
      dir: 'public/golf/osm',
      count: osmManifest?.count ?? 0,
    },
    holes: {
      dir: 'public/golf/holes',
      count: holesManifest?.count ?? 0,
    },
    reRun: 'node scripts/backup-osm-data.mjs --skip-existing',
  };
  writeJson(join(DATA_DIR, 'manifest.json'), index);

  // Keep a second copy of OSM manifests under data/ for local tooling.
  if (existsSync(join(OSM_DIR, 'manifest.json'))) {
    copyFileSync(
      join(OSM_DIR, 'manifest.json'),
      join(DATA_DIR, 'osm-manifest.json'),
    );
  }
  if (existsSync(join(HOLES_DIR, 'manifest.json'))) {
    copyFileSync(
      join(HOLES_DIR, 'manifest.json'),
      join(DATA_DIR, 'holes-manifest.json'),
    );
  }
  return index;
}

async function backupOsmOne(course, { skipExisting, force, dryRun }) {
  const outPath = join(OSM_DIR, `${course.slug}.json`);
  if (skipExisting && !force && existsSync(outPath)) {
    return { slug: course.slug, status: 'skipped' };
  }
  try {
    const { elements, bbox, source } = await fetchOsmForCourse(course);
    if (!elements.length) {
      return { slug: course.slug, status: 'empty' };
    }
    const pack = {
      version: 1,
      slug: course.slug,
      name: course.name,
      lat: course.lat,
      lon: course.lon,
      bbox,
      fetchedAt: new Date().toISOString(),
      source: source || 'osm-map',
      attribution: '© OpenStreetMap contributors (ODbL)',
      elementCount: elements.length,
      elements,
    };
    if (!dryRun) writeJson(outPath, pack);
    return {
      slug: course.slug,
      status: 'ok',
      elementCount: elements.length,
      source: source || 'osm-map',
      bytes: dryRun ? 0 : Buffer.byteLength(JSON.stringify(pack)),
    };
  } catch (err) {
    return {
      slug: course.slug,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function backupHolesOne(course, { skipExisting, force, dryRun }) {
  const outPath = join(HOLES_DIR, `${course.slug}.json`);
  if (skipExisting && !force && existsSync(outPath)) {
    try {
      const existing = readJson(outPath);
      if (isCompleteLayout(existing.holes)) {
        return { slug: course.slug, status: 'skipped' };
      }
    } catch {
      // rewrite corrupt / incomplete
    }
  }
  let holes = [];
  let source = 'api';
  try {
    holes = await fetchHoles(course);
  } catch {
    holes = await holesFromLocalOsm(course);
    source = 'osm-backup';
  }
  if (!isCompleteLayout(holes)) {
    const local = await holesFromLocalOsm(course);
    if (isCompleteLayout(local) && local.length >= (holes?.length ?? 0)) {
      holes = local;
      source = 'osm-backup';
    }
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
  if (!dryRun) writeJson(outPath, pack);
  return {
    slug: course.slug,
    status: 'ok',
    count: pack.count,
    source,
    bytes: dryRun ? 0 : Buffer.byteLength(JSON.stringify(pack)),
  };
}

async function mapPool(items, concurrency, fn, { shouldStop } = {}) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      if (shouldStop?.()) break;
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
  const { flags, only, limit, concurrency, goal, deadlineMs, shard } = parseArgs(
    process.argv.slice(2),
  );
  const dryRun = flags.has('dry-run');
  const skipExisting = flags.has('skip-existing') && !flags.has('force');
  const doOsm = !flags.has('holes-only');
  const doHoles = !flags.has('osm-only');
  const fast = flags.has('fast');
  const startedAt = Date.now();
  const deadlineAt = deadlineMs > 0 ? startedAt + deadlineMs : Infinity;
  const localizedAtStart = new Set();
  if (existsSync(HOLES_DIR) && existsSync(OSM_DIR)) {
    for (const f of readdirSync(HOLES_DIR)) {
      if (!f.endsWith('.json') || f === 'manifest.json') continue;
      const slug = f.replace(/\.json$/, '');
      if (isFullyLocalized(slug)) localizedAtStart.add(slug);
    }
  }
  let newLocalized = 0;
  const noteNew = (slug) => {
    if (!localizedAtStart.has(slug) && isFullyLocalized(slug)) {
      localizedAtStart.add(slug);
      newLocalized += 1;
      if (Number.isFinite(goal) && newLocalized >= goal) {
        console.log(`\n★ Goal reached: ${newLocalized} newly localized`);
      }
    }
  };
  const shouldStop = () =>
    Date.now() >= deadlineAt ||
    (Number.isFinite(goal) && newLocalized >= goal);

  const targets = mergeTargets({
    only,
    limit,
    fromCatalog: flags.has('from-catalog'),
    fromOsmBackups: flags.has('from-osm-backups'),
    missingOnly: flags.has('missing-only'),
    needsOsm: flags.has('needs-osm'),
    needsHoles: flags.has('needs-holes'),
    shard,
  });
  const shardLabel = shard ? ` shard ${shard.index}/${shard.total}` : '';
  const mirrorLabel = process.env.OVERPASS_URL
    ? ` mirror ${new URL(process.env.OVERPASS_URL).hostname}`
    : '';
  console.log(
    `OSM backup for ${targets.length} courses` +
      ` (concurrency=${concurrency}` +
      `${doOsm ? ', osm' : ''}${doHoles ? ', holes' : ''}` +
      `${flags.has('from-catalog') ? ', catalog' : ''}` +
      `${flags.has('missing-only') ? ', missing-only' : ''}` +
      `${fast ? ', fast' : ''}` +
      `${shardLabel}${mirrorLabel}` +
      `${Number.isFinite(goal) ? `, goal=${goal}` : ''}` +
      `${deadlineMs ? `, deadline=${Math.round(deadlineMs / 1000)}s` : ''}` +
      `${dryRun ? ', dry-run' : ''}` +
      `${skipExisting ? ', skip-existing' : ''})`,
  );
  console.log(`Fully localized at start: ${localizedAtStart.size}`);

  const osmOkDelay = fast ? 80 : 600;
  const osmFailDelay = fast ? 400 : 1_500;
  const holesDelay = fast ? 60 : 400;
  const holesConcurrency = fast ? concurrency : Math.min(concurrency, 2);

  if (doOsm) {
    console.log('\n=== Raw OSM map elements → public/golf/osm ===');
    const results = await mapPool(
      targets,
      concurrency,
      async (course) => {
        const result = await backupOsmOne(course, {
          skipExisting,
          force: flags.has('force'),
          dryRun,
        });
        const mark =
          result.status === 'ok'
            ? '✓'
            : result.status === 'skipped'
              ? '·'
              : result.status === 'empty'
                ? '~'
                : '✗';
        console.log(
          `${mark} osm ${course.slug} → ${result.status}` +
            (result.elementCount != null ? ` (${result.elementCount} els` : '') +
            (result.source ? ` via ${result.source}` : '') +
            (result.elementCount != null ? ')' : '') +
            (result.error ? ` — ${result.error}` : '') +
            (result.bytes ? ` ${Math.round(result.bytes / 1024)}KB` : ''),
        );
        if (result.status === 'ok') await sleep(osmOkDelay);
        else if (result.status === 'failed') await sleep(osmFailDelay);
        return result;
      },
      { shouldStop },
    );
    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(`OSM map: ${ok} ok, ${skipped} skipped, ${failed} failed`);
  }

  if (doHoles && !shouldStop()) {
    console.log('\n=== Hole geometry packs → public/golf/holes ===');
    const results = await mapPool(
      targets,
      holesConcurrency,
      async (course) => {
        const result = await backupHolesOne(course, {
          skipExisting,
          force: flags.has('force'),
          dryRun,
        });
        if (result.status === 'ok') noteNew(course.slug);
        const mark =
          result.status === 'ok'
            ? '✓'
            : result.status === 'skipped'
              ? '·'
              : result.status === 'incomplete'
                ? '~'
                : '✗';
        console.log(
          `${mark} holes ${course.slug} → ${result.status}` +
            (result.count != null ? ` (${result.count} holes)` : '') +
            (result.error ? ` — ${result.error}` : '') +
            (result.bytes ? ` ${Math.round(result.bytes / 1024)}KB` : '') +
            (newLocalized > 0 && Number.isFinite(goal)
              ? ` [${newLocalized}/${goal}]`
              : ''),
        );
        if (result.status === 'ok' || result.status === 'incomplete') {
          await sleep(holesDelay);
        }
        return result;
      },
      { shouldStop },
    );
    const ok = results.filter((r) => r.status === 'ok').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const incomplete = results.filter((r) => r.status === 'incomplete').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(
      `Holes: ${ok} ok, ${skipped} skipped, ${incomplete} incomplete, ${failed} failed`,
    );
  }

  if (!dryRun) {
    const osmManifest = writeOsmManifest();
    const holesManifest = writeHolesManifest();
    const index = writeDataIndex(osmManifest, holesManifest);
    console.log(
      `\nIndex: osm=${index.osm.count} holes=${index.holes.count} → data/osm-backup/manifest.json`,
    );
  }
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  console.log(
    `\nSprint: +${newLocalized} newly localized in ${elapsed}s (total ${localizedAtStart.size})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
