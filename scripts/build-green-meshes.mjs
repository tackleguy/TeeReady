#!/usr/bin/env node
/**
 * Build 3D green mesh JSON from free OSM polygons + USGS 3DEP elevation.
 * Output: public/golf/greens/{slug}.json
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/golf/greens');
const CATALOG_PATH = join(ROOT, 'api/golf/_data/usCatalog.json');
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USGS =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const UA = 'TeeReady/1.0 (green-mesh-builder)';

/** Hand-tuned splits (shared facilities). */
const CURATED = [
  {
    slug: 'torrey-pines-south',
    name: 'South At Torrey Pines Municipal Golf Course',
    lat: 32.90246,
    lon: -117.24627,
    radiusM: 2200,
    maxLat: 32.904,
  },
  {
    slug: 'torrey-pines-north',
    name: 'North At Torrey Pines Municipal Golf Course',
    lat: 32.90467,
    lon: -117.24462,
    radiusM: 2200,
    minLat: 32.904,
  },
  {
    slug: 'pebble-beach-golf-links',
    name: 'Pebble Beach Golf Links',
    lat: 36.56071,
    lon: -121.9296,
    radiusM: 1400,
  },
];

/** Prefer well-mapped venues when expanding from the US catalog. */
const PRIORITY_NEEDLES = [
  'bethpage',
  'pinehurst',
  'augusta national',
  'pebble beach',
  'torrey pines',
  'whistling straits',
  'tpc sawgrass',
  'tpc scottsdale',
  'riviera country',
  'spyglass',
  'kiawah',
  'bandon',
  'chambers bay',
  'erin hills',
  'oakmont',
  'merion',
  'shinnecock',
  'winged foot',
  'congressional',
  'olympic club',
  'pacific dunes',
  'spanish bay',
  'harbour town',
  'streamsong',
  'sand valley',
  'pelican hill',
  'poppy hills',
  'pasatiempo',
  'cypress point',
  'monterey peninsula',
  'griffith park',
  'sepulveda',
  'rancho park',
  'harding park',
  'tpc harding',
  'presidio',
  'sharp park',
  'aviara',
  'barona creek',
  'maderas',
  'la costa',
  'coronado golf',
  'steele canyon',
  'rustic canyon',
  'sandpiper',
  'los verdes',
  'industry hills',
  'wilson golf',
  'hansen dam',
  'brookside golf club',
  'angeles national',
  'troon north',
  'we-ko-pa',
  'talking stick',
  'grayhawk',
  'pga west',
  'la quinta',
  'kapalua',
  'waialae',
  'bandon dunes',
  'pacific pines',
  'torrey',
  'balboa at sepulveda',
  'encino at sepulveda',
  'crystal springs',
  'half moon bay',
  'cordevalle',
  'silverado',
  'peacock gap',
  'meadow club',
  'california golf club',
  'lake merced',
  'lincoln park golf',
  'golden gate park',
  'mission bay golf',
  'admira baker',
  'admiral baker',
  'riverwalk golf',
  'cottonwood golf',
  'fairbanks ranch',
  'the farms golf',
  'rancho bernardo',
  'twin oaks golf',
  'scottsdale national',
  'phoenix country',
  'papago',
  'encanto golf',
  'cave creek',
  'bandon trails',
  'sheep ranch',
  'old macdonald',
];

const SKIP_ST = new Set(['AK', 'PR', 'VI', 'GU', 'AS', 'MP']);
/** Slightly coarser than first Torrey builds — packs more courses into deploy size. */
const GRID_M = 1.15;
const PAD_M = 6;
const MIN_GREENS_OSM = 10;
const MIN_MESH_HOLES = 9;
const DEFAULT_RADIUS_M = 1600;

function mPerDegree(lat) {
  const latRad = (lat * Math.PI) / 180;
  return { mLat: 111_320, mLon: 111_320 * Math.cos(latRad) };
}

function toLocal(lat, lon, lat0, lon0, scale) {
  return {
    x: (lon - lon0) * scale.mLon,
    y: (lat - lat0) * scale.mLat,
  };
}

function fromLocal(x, y, lat0, lon0, scale) {
  return {
    lat: lat0 + y / scale.mLat,
    lon: lon0 + x / scale.mLon,
  };
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

function ringCentroid(ring) {
  let lat = 0;
  let lon = 0;
  for (const p of ring) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].x;
    const yi = ring[i].y;
    const xj = ring[j].x;
    const yj = ring[j].y;
    const hit = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (hit) inside = !inside;
  }
  return inside;
}

function overpassBackoffMs(status, attempt) {
  if (status === 429) return 3000 + attempt * 2000 + Math.floor(Math.random() * 2000);
  if (status === 504 || status === 502) return 4000 + attempt * 1500;
  return 2000 + attempt * 1000;
}

async function overpass(query, { urls = OVERPASS_URLS, retries = 3 } = {}) {
  let lastErr = 'Overpass failed';
  let lastStatus = 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': UA,
          },
          body: new URLSearchParams({ data: query }),
        });
        if (!res.ok) {
          lastStatus = res.status;
          lastErr = `${url} ${res.status}`;
          continue;
        }
        return res.json();
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
      }
    }
    if (attempt < retries) {
      const wait = overpassBackoffMs(lastStatus, attempt);
      console.warn(`Overpass retry ${attempt + 1}/${retries} in ${wait}ms (${lastErr})`);
      await sleep(wait);
    }
  }
  throw new Error(lastErr);
}

async function fetch3dep(west, south, east, north, size) {
  const q = (f) =>
    `${USGS}?bbox=${west},${south},${east},${north}&bboxSR=4326&size=${size},${size}` +
    '&imageSR=4326&format=bsq&pixelType=F32&interpolation=RSP_BilinearInterpolation&' +
    `f=${f}`;
  const meta = await fetch(q('json'), { headers: { 'User-Agent': UA } }).then((r) => {
    if (!r.ok) throw new Error(`3DEP meta ${r.status}`);
    return r.json();
  });
  const buf = Buffer.from(
    await fetch(q('image'), { headers: { 'User-Agent': UA } }).then((r) => {
      if (!r.ok) throw new Error(`3DEP image ${r.status}`);
      return r.arrayBuffer();
    }),
  );
  const heights = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return { west, south, east, north, width: meta.width, height: meta.height, heights };
}

function samplePatch(patch, lon, lat) {
  const { west, south, east, north, width, height, heights } = patch;
  const fx = Math.min(Math.max((lon - west) / (east - west), 0), 1) * (width - 1.001);
  const fy = Math.min(Math.max((north - lat) / (north - south), 0), 1) * (height - 1.001);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;
  const h = (ix, iy) => {
    const v = heights[iy * width + ix];
    return v < -1e4 || !Number.isFinite(v) ? null : v;
  };
  const h00 = h(x0, y0);
  const h10 = h(x0 + 1, y0);
  const h01 = h(x0, y0 + 1);
  const h11 = h(x0 + 1, y0 + 1);
  if (h00 == null || h10 == null || h01 == null || h11 == null) return null;
  return (
    h00 * (1 - dx) * (1 - dy) +
    h10 * dx * (1 - dy) +
    h01 * (1 - dx) * dy +
    h11 * dx * dy
  );
}

function buildMesh(ringLocal, patch, origin) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of ringLocal) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  minX -= PAD_M;
  minY -= PAD_M;
  maxX += PAD_M;
  maxY += PAD_M;

  const nx = Math.max(2, Math.ceil((maxX - minX) / GRID_M) + 1);
  const ny = Math.max(2, Math.ceil((maxY - minY) / GRID_M) + 1);
  const positions = [];
  const indices = [];
  const grid = new Array(nx * ny).fill(null);
  let baseElev = null;

  for (let j = 0; j < ny; j++) {
    const y = minY + j * GRID_M;
    for (let i = 0; i < nx; i++) {
      const x = minX + i * GRID_M;
      if (!pointInRing(x, y, ringLocal)) continue;
      const { lat, lon } = fromLocal(x, y, origin.lat, origin.lon, origin.scale);
      const elev = samplePatch(patch, lon, lat);
      if (elev == null) continue;
      if (baseElev == null) baseElev = elev;
      const idx = positions.length / 3;
      grid[j * nx + i] = idx;
      positions.push(
        Math.round(x * 100) / 100,
        Math.round((elev - baseElev) * 100) / 100,
        Math.round(y * 100) / 100,
      );
    }
  }

  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = grid[j * nx + i];
      const b = grid[j * nx + i + 1];
      const c = grid[(j + 1) * nx + i];
      const d = grid[(j + 1) * nx + i + 1];
      if (a == null || b == null || c == null) continue;
      indices.push(a, b, c);
      if (b == null || c == null || d == null) continue;
      indices.push(b, d, c);
    }
  }

  return { positions, indices, baseElev: baseElev ?? 0 };
}

function holeEnds(elements) {
  /** @type {Array<{ number: number; lat: number; lon: number }>} */
  const out = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry?.length) continue;
    const tags = el.tags ?? {};
    if (tags.golf !== 'hole') continue;
    const ref = tags.ref ?? tags.hole;
    const num = ref != null ? Number(String(ref).replace(/\D/g, '')) : NaN;
    if (!Number.isFinite(num)) continue;
    const end = el.geometry[el.geometry.length - 1];
    out.push({ number: num, lat: end.lat, lon: end.lon });
  }
  return out;
}

function assignHoles(greenItems, holeEndsList) {
  const assigned = new Map();
  const used = new Set();
  const sortedHoles = [...holeEndsList].sort((a, b) => a.number - b.number);

  const claimNearest = (maxM) => {
    for (const h of sortedHoles) {
      if ([...assigned.values()].includes(h.number)) continue;
      let bestIdx = -1;
      let bestD = Infinity;
      greenItems.forEach((g, idx) => {
        if (used.has(idx)) return;
        const d = haversineM(g.centroid.lat, g.centroid.lon, h.lat, h.lon);
        if (d < bestD) {
          bestD = d;
          bestIdx = idx;
        }
      });
      if (bestIdx >= 0 && bestD < maxM) {
        used.add(bestIdx);
        assigned.set(bestIdx, h.number);
      }
    }
  };

  // Tight match first, then a wider pass so all 18 get a green when OSM is sparse.
  claimNearest(55);
  claimNearest(120);
  claimNearest(220);

  // Any greens with explicit ref tags
  greenItems.forEach((g, idx) => {
    if (assigned.has(idx)) return;
    const ref = g.ref;
    if (
      Number.isFinite(ref) &&
      ref >= 1 &&
      ref <= 18 &&
      ![...assigned.values()].includes(ref)
    ) {
      assigned.set(idx, ref);
      used.add(idx);
    }
  });

  // Fill any still-missing hole numbers with the nearest leftover green.
  const missing = [];
  for (let n = 1; n <= 18; n++) {
    if (![...assigned.values()].includes(n)) missing.push(n);
  }
  for (const n of missing) {
    const end = sortedHoles.find((h) => h.number === n);
    let bestIdx = -1;
    let bestD = Infinity;
    greenItems.forEach((g, idx) => {
      if (used.has(idx)) return;
      const d = end
        ? haversineM(g.centroid.lat, g.centroid.lon, end.lat, end.lon)
        : 0;
      if (d < bestD) {
        bestD = d;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) {
      used.add(bestIdx);
      assigned.set(bestIdx, n);
    }
  }

  return assigned;
}

async function buildCourse(course) {
  const { slug, lat, lon, radiusM, name, maxLat, minLat } = course;
  const greenQuery = `
[out:json][timeout:60];
(
  way["golf"="green"](around:${radiusM},${lat},${lon});
);
out tags geom;
`.trim();
  const holeQuery = `
[out:json][timeout:45];
way["golf"="hole"](around:${radiusM},${lat},${lon});
out tags geom;
`.trim();

  const greenBody = await overpass(greenQuery, {
    urls: ['https://overpass-api.de/api/interpreter'],
  });
  let holeBody = { elements: [] };
  try {
    holeBody = await overpass(holeQuery, {
      urls: ['https://overpass-api.de/api/interpreter'],
    });
  } catch {
    console.warn(`${slug}: hole lines unavailable — matching by proximity only`);
  }
  const greens = (greenBody.elements ?? []).filter(
    (el) => el.tags?.golf === 'green' && el.geometry?.length >= 3,
  );
  const holes = holeEnds(holeBody.elements ?? []);
  console.log(`${slug}: ${greens.length} greens, ${holes.length} hole ends`);

  const scale = mPerDegree(lat);
  const greenItems = greens
    .map((el) => {
      const ring = el.geometry.map((p) => ({ lat: p.lat, lon: p.lon }));
      const centroid = ringCentroid(ring);
      const refRaw = el.tags?.ref ?? el.tags?.hole;
      const ref = refRaw != null ? Number(String(refRaw).replace(/\D/g, '')) : NaN;
      return {
        ring,
        centroid,
        ref: Number.isFinite(ref) ? ref : null,
        ringLocal: ring.map((p) => toLocal(p.lat, p.lon, lat, lon, scale)),
      };
    })
    .filter((g) => {
      if (maxLat != null && g.centroid.lat > maxLat) return false;
      if (minLat != null && g.centroid.lat < minLat) return false;
      return true;
    });

  const holeAssign = assignHoles(greenItems, holes);
  /** @type {Array<{ hole: number; lat: number; lon: number; baseElevM: number; positions: number[]; indices: number[] }>} */
  const meshes = [];

  for (let idx = 0; idx < greenItems.length; idx++) {
    const hole = holeAssign.get(idx);
    if (hole == null) continue;
    const { ring, centroid, ringLocal } = greenItems[idx];
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const p of ring) {
      minLon = Math.min(minLon, p.lon);
      minLat = Math.min(minLat, p.lat);
      maxLon = Math.max(maxLon, p.lon);
      maxLat = Math.max(maxLat, p.lat);
    }
    const pad = 0.00008;
    const size = Math.min(
      120,
      Math.max(24, Math.ceil(Math.max(maxLon - minLon, maxLat - minLat) / 0.000009)),
    );
    let patch;
    try {
      patch = await fetch3dep(
        minLon - pad,
        minLat - pad,
        maxLon + pad,
        maxLat + pad,
        size,
      );
    } catch (err) {
      console.warn(`  hole ${hole}: 3DEP failed — ${err.message}`);
      continue;
    }

    const mesh = buildMesh(ringLocal, patch, { lat, lon, scale });
    if (mesh.indices.length < 6) {
      console.warn(`  hole ${hole}: mesh too sparse`);
      continue;
    }
    meshes.push({
      hole,
      lat: centroid.lat,
      lon: centroid.lon,
      baseElevM: Math.round(mesh.baseElev * 10) / 10,
      positions: mesh.positions,
      indices: mesh.indices,
    });
    console.log(`  hole ${hole}: ${mesh.indices.length / 3} tris`);
  }

  meshes.sort((a, b) => a.hole - b.hole);
  const byHole = new Map();
  for (const mesh of meshes) {
    const prev = byHole.get(mesh.hole);
    if (!prev || mesh.indices.length > prev.indices.length) byHole.set(mesh.hole, mesh);
  }
  const unique = [...byHole.values()].sort((a, b) => a.hole - b.hole);
  return {
    id: slug,
    name,
    lat,
    lon,
    gridM: GRID_M,
    greens: unique,
    builtAt: new Date().toISOString(),
    source: 'OpenStreetMap golf=green + USGS 3DEP (free)',
  };
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

function parseArgs(argv) {
  const flags = new Set();
  const only = [];
  let limit = 120;
  let minGreens = MIN_GREENS_OSM;
  let shard = null;
  let deadlineMs = 0;
  for (const a of argv) {
    if (a === '--bulk') flags.add('bulk');
    else if (a === '--skip-existing') flags.add('skip-existing');
    else if (a === '--manifest-only') flags.add('manifest-only');
    else if (a === '--all-catalog') flags.add('all-catalog');
    else if (a.startsWith('--limit=')) limit = Number(a.slice(8)) || limit;
    else if (a.startsWith('--min-greens='))
      minGreens = Number(a.slice(13)) || minGreens;
    else if (a.startsWith('--shard=')) {
      const m = a.slice(8).match(/^(\d+)\/(\d+)$/);
      if (m) shard = { index: Number(m[1]), total: Number(m[2]) };
    } else if (a.startsWith('--deadline-ms='))
      deadlineMs = Number(a.slice(14)) || 0;
    else if (!a.startsWith('-')) only.push(a);
  }
  return { flags, only, limit, minGreens, shard, deadlineMs };
}

/** Stable shard key for parallel workers. */
function shardKey(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return h;
}

function inShard(slug, shard) {
  if (!shard || shard.total < 1) return true;
  return shardKey(slug) % shard.total === shard.index;
}

function catalogEligible(c) {
  if (c.la == null || c.lo == null) return false;
  if (c.h != null && c.h < 9) return false;
  if (c.st && SKIP_ST.has(c.st)) return false;
  // HI has poor 3DEP coverage for many islands — skip unless curated.
  if (c.st === 'HI') return false;
  return true;
}

function loadFromCatalog({ limit, allCatalog, shard }) {
  if (!existsSync(CATALOG_PATH)) return [];
  const cat = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  /** @type {Array<{ slug: string; name: string; lat: number; lon: number; radiusM: number }>} */
  const out = [];
  const seen = new Set(CURATED.map((c) => c.slug));
  for (const c of cat) {
    if (out.length >= limit) break;
    if (!catalogEligible(c)) continue;
    const n = String(c.n || '').toLowerCase();
    if (!allCatalog && !PRIORITY_NEEDLES.some((k) => n.includes(k))) continue;
    const slug = slugify(c.n);
    if (!slug || seen.has(slug)) continue;
    if (!inShard(slug, shard)) continue;
    seen.add(slug);
    out.push({
      slug,
      name: c.n,
      lat: c.la,
      lon: c.lo,
      radiusM: DEFAULT_RADIUS_M,
    });
  }
  return out;
}

function loadPriorityFromCatalog(limit, shard = null) {
  return loadFromCatalog({ limit, allCatalog: false, shard });
}

async function countOsmGreens(lat, lon, radiusM) {
  const q = `
[out:json][timeout:40];
way["golf"="green"](around:${radiusM},${lat},${lon});
out count;
`.trim();
  const body = await overpass(q);
  const el = body.elements?.[0];
  const n = el?.tags?.ways ?? el?.tags?.total ?? 0;
  return Number(n) || 0;
}

function writeManifest() {
  const files = readdirSync(OUT_DIR).filter(
    (f) => f.endsWith('.json') && f !== 'manifest.json',
  );
  const entries = [];
  for (const f of files) {
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
      if (!data?.greens?.length) continue;
      entries.push({
        slug: data.id || f.replace(/\.json$/, ''),
        name: data.name,
        lat: data.lat,
        lon: data.lon,
        holes: data.greens.length,
        holeNumbers: data.greens.map((g) => g.hole).sort((a, b) => a - b),
      });
    } catch {
      /* skip bad file */
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const manifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    count: entries.length,
    courses: entries,
  };
  writeFileSync(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest));
  console.log(`Manifest: ${entries.length} courses → public/golf/greens/manifest.json`);
  return manifest;
}

async function writeCourse(course, { skipExisting, minGreens }) {
  const outPath = join(OUT_DIR, `${course.slug}.json`);
  if (skipExisting && existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, 'utf8'));
      if ((prev.greens?.length ?? 0) >= MIN_MESH_HOLES) {
        console.log(`skip ${course.slug} (existing ${prev.greens.length} greens)`);
        return 'skipped-existing';
      }
    } catch {
      /* rebuild */
    }
  }

  // Quick OSM density check before full geom + 3DEP pull.
  if (!course.maxLat && !course.minLat) {
    try {
      const n = await countOsmGreens(course.lat, course.lon, course.radiusM);
      console.log(`${course.slug}: OSM green count ≈ ${n}`);
      if (n < minGreens) {
        console.log(`  skip — need ≥ ${minGreens} greens\n`);
        return 'skipped-sparse';
      }
    } catch (err) {
      console.warn(
        `${course.slug}: count failed (${err.message}) — trying full build`,
      );
    }
    await sleep(400);
  }

  const data = await buildCourse(course);
  if (data.greens.length < MIN_MESH_HOLES) {
    console.warn(
      `${course.slug}: only ${data.greens.length} meshes — not writing\n`,
    );
    return 'skipped-mesh';
  }
  writeFileSync(outPath, JSON.stringify(data));
  console.log(
    `Wrote ${outPath} (${data.greens.length} greens · holes ${data.greens.map((g) => g.hole).join(',')})\n`,
  );
  await sleep(600);
  return 'written';
}

mkdirSync(OUT_DIR, { recursive: true });

const { flags, only, limit, minGreens, shard, deadlineMs } = parseArgs(
  process.argv.slice(2),
);

if (flags.has('manifest-only')) {
  writeManifest();
  process.exit(0);
}

/** @type {typeof CURATED} */
let queue = [];
if (only.length) {
  const fromCurated = CURATED.filter((c) => only.includes(c.slug));
  const fromCatalog = loadPriorityFromCatalog(500, shard).filter((c) =>
    only.includes(c.slug),
  );
  queue = [...fromCurated, ...fromCatalog];
  if (!queue.length) {
    // Allow ad-hoc slug rebuild of existing file coords via curated/priority only.
    console.error('No matching course slugs in curated/priority lists:', only);
    process.exitCode = 1;
  }
} else if (flags.has('bulk')) {
  const curated = shard
    ? CURATED.filter((c) => inShard(c.slug, shard))
    : [...CURATED];
  const fromCatalog = loadFromCatalog({
    limit,
    allCatalog: flags.has('all-catalog'),
    shard,
  });
  queue = [...curated, ...fromCatalog];
} else {
  queue = [...CURATED];
}

const startedAt = Date.now();
const shardLabel = shard ? ` shard ${shard.index}/${shard.total}` : '';
const catalogLabel = flags.has('all-catalog') ? ' (all-catalog)' : '';
console.log(
  `Building ${queue.length} course(s)${catalogLabel}${shardLabel}…` +
    (deadlineMs ? ` deadline ${Math.round(deadlineMs / 1000)}s` : '') +
    '\n',
);

let wrote = 0;
let skipped = 0;
let failed = 0;

for (const course of queue) {
  if (deadlineMs && Date.now() - startedAt >= deadlineMs) {
    console.log(`Deadline reached — stopping after ${wrote} writes\n`);
    break;
  }
  try {
    const status = await writeCourse(course, {
      skipExisting: flags.has('skip-existing'),
      minGreens,
    });
    if (status === 'written') wrote += 1;
    else skipped += 1;
  } catch (err) {
    failed += 1;
    console.error(`${course.slug} failed:`, err.message || err);
    process.exitCode = 1;
    const msg = String(err.message || err);
    const isOverpass =
      msg.includes('429') || msg.includes('504') || msg.includes('Overpass');
    await sleep(isOverpass ? 5000 + Math.floor(Math.random() * 3000) : 1500);
  }
}

console.log(
  `Done${shardLabel}: wrote ${wrote}, skipped ${skipped}, failed ${failed}, ` +
    `${Math.round((Date.now() - startedAt) / 1000)}s elapsed`,
);

writeManifest();

