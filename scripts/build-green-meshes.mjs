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
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
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
  'wilson at griffith',
  'hansen dam',
  'brookside golf club',
  'angeles national',
  'troon north',
  'we-ko-pa',
  'we ko pa',
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
  // Expanded coverage — high-OSM / well-known public & championship venues
  'east lake golf',
  'muirfield village',
  'inverness club',
  'medinah',
  'liberty national',
  'hazeltine',
  'oak hill country',
  'baltusrol',
  'firestone',
  'bay hill',
  'quail hollow',
  'valhalla',
  'scioto',
  'prairie dunes',
  'crystal downs',
  'fishers island',
  'san francisco golf club',
  'poppy hills',
  'oak point at kiawah',
  'turtle point at kiawah',
  'eisenhower',
  'raptor at grayhawk',
  'talon at grayhawk',
  'cholla course at we ko pa',
  'saguaro course at we ko pa',
  'the olympic club',
  'the riviera country club',
  'the links at spanish bay',
  'ocean north at pelican',
  'ocean south at pelican',
  'tpc sawgrass the players',
  'tpc sawgrass dyes',
  'tpc harding park harding',
  'tpc harding park fleming',
  'tpc scottsdale the stadium',
  'pinehurst resort country club no 2',
  'pinehurst resort country club no 4',
  'pinehurst resort country club no 8',
  'black at bethpage',
  'red at bethpage',
  'yellow at bethpage',
  'spyglass hill',
  'whistling straits',
  'streamsong resort red',
  'streamsong resort blue',
  'streamsong resort black',
  'sand valley golf resort',
  'half moon bay golf links ocean',
  'silverado resort',
  'presidio golf course',
  'sharp park golf',
  'rancho park golf',
  'rustic canyon',
  'steele canyon',
  'coronado golf course',
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

function assignHoles(greenItems, holeEndsList, targetHoles = 18) {
  const assigned = new Map();
  const used = new Set();
  const sortedHoles = [...holeEndsList].sort((a, b) => a.number - b.number);
  const maxHole = Math.max(
    targetHoles,
    ...sortedHoles.map((h) => h.number),
    ...greenItems.map((g) => (Number.isFinite(g.ref) ? g.ref : 0)),
    9,
  );
  const holeCap = Math.min(18, Math.max(targetHoles, maxHole));

  const claimNearest = (maxM) => {
    for (const h of sortedHoles) {
      if (h.number < 1 || h.number > holeCap) continue;
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

  // Tight match first, then wider passes so sparse OSM still maps.
  claimNearest(55);
  claimNearest(120);
  claimNearest(220);
  claimNearest(380);

  // Any greens with explicit ref tags
  greenItems.forEach((g, idx) => {
    if (assigned.has(idx)) return;
    const ref = g.ref;
    if (
      Number.isFinite(ref) &&
      ref >= 1 &&
      ref <= holeCap &&
      ![...assigned.values()].includes(ref)
    ) {
      assigned.set(idx, ref);
      used.add(idx);
    }
  });

  // Fill missing hole numbers with the nearest leftover green.
  const missing = [];
  for (let n = 1; n <= holeCap; n++) {
    if (![...assigned.values()].includes(n)) missing.push(n);
  }
  for (const n of missing) {
    const end = sortedHoles.find((h) => h.number === n);
    // Prefer greens near adjacent assigned holes when hole-end is missing.
    const neighbors = [n - 1, n + 1]
      .map((hn) => {
        const idx = [...assigned.entries()].find(([, hole]) => hole === hn)?.[0];
        return idx != null ? greenItems[idx] : null;
      })
      .filter(Boolean);
    let bestIdx = -1;
    let bestD = Infinity;
    greenItems.forEach((g, idx) => {
      if (used.has(idx)) return;
      let d = Infinity;
      if (end) {
        d = haversineM(g.centroid.lat, g.centroid.lon, end.lat, end.lon);
      } else if (neighbors.length) {
        d = Math.min(
          ...neighbors.map((nb) =>
            haversineM(
              g.centroid.lat,
              g.centroid.lon,
              nb.centroid.lat,
              nb.centroid.lon,
            ),
          ),
        );
      } else {
        d = 0;
      }
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
  const { slug, lat, lon, radiusM, name, maxLat, minLat, targetHoles = 18 } =
    course;
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

  const greenBody = await overpass(greenQuery);
  let holeBody = { elements: [] };
  try {
    holeBody = await overpass(holeQuery);
  } catch {
    console.warn(`${slug}: hole lines unavailable — matching by proximity only`);
  }
  const greens = (greenBody.elements ?? []).filter(
    (el) => el.tags?.golf === 'green' && el.geometry?.length >= 3,
  );
  const holes = holeEnds(holeBody.elements ?? []);
  console.log(`${slug}: ${greens.length} greens, ${holes.length} hole ends`);

  const scale = mPerDegree(lat);
  let greenItems = greens
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

  // When a dense cluster pulls in neighboring courses, keep greens near hole
  // ends or the course pin (within ~1.1 km of pin / any hole end).
  if (greenItems.length > targetHoles + 8 && holes.length >= 9) {
    const anchors = holes.length
      ? holes
      : [{ lat, lon }];
    greenItems = greenItems.filter((g) =>
      anchors.some(
        (a) => haversineM(g.centroid.lat, g.centroid.lon, a.lat, a.lon) < 1100,
      ),
    );
    console.log(`${slug}: filtered to ${greenItems.length} greens near hole ends`);
  }

  const holeAssign = assignHoles(greenItems, holes, targetHoles);
  /** @type {Array<{ hole: number; lat: number; lon: number; baseElevM: number; positions: number[]; indices: number[] }>} */
  const meshes = [];

  for (let idx = 0; idx < greenItems.length; idx++) {
    const hole = holeAssign.get(idx);
    if (hole == null) continue;
    const { ring, centroid, ringLocal } = greenItems[idx];
    let minLon = Infinity;
    let minLatG = Infinity;
    let maxLon = -Infinity;
    let maxLatG = -Infinity;
    for (const p of ring) {
      minLon = Math.min(minLon, p.lon);
      minLatG = Math.min(minLatG, p.lat);
      maxLon = Math.max(maxLon, p.lon);
      maxLatG = Math.max(maxLatG, p.lat);
    }
    const pad = 0.00008;
    const size = Math.min(
      120,
      Math.max(24, Math.ceil(Math.max(maxLon - minLon, maxLatG - minLatG) / 0.000009)),
    );
    let patch = null;
    try {
      patch = await fetch3dep(
        minLon - pad,
        minLatG - pad,
        maxLon + pad,
        maxLatG + pad,
        size,
      );
    } catch (err) {
      console.warn(`  hole ${hole}: 3DEP failed — flat mesh (${err.message})`);
    }

    const mesh = patch
      ? buildMesh(ringLocal, patch, { lat, lon, scale })
      : buildFlatMesh(ringLocal);
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

function buildFlatMesh(ringLocal) {
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
  for (let j = 0; j < ny; j++) {
    const y = minY + j * GRID_M;
    for (let i = 0; i < nx; i++) {
      const x = minX + i * GRID_M;
      if (!pointInRing(x, y, ringLocal)) continue;
      const idx = positions.length / 3;
      grid[j * nx + i] = idx;
      positions.push(Math.round(x * 100) / 100, 0, Math.round(y * 100) / 100);
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
      if (d == null) continue;
      indices.push(b, d, c);
    }
  }
  return { positions, indices, baseElev: 0 };
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
    else if (a === '--force') flags.add('force');
    else if (a === '--complete-incomplete') flags.add('complete-incomplete');
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

/** Catalog slugify names that already have a curated pack under another slug. */
const SKIP_CATALOG_SLUGS = new Set([
  'north-at-torrey-pines-municipal-golf-course', // → torrey-pines-north
  'south-at-torrey-pines-municipal-golf-course', // → torrey-pines-south
  'pebble-beach-golf-links', // curated
]);

function existingGreenSlugs() {
  if (!existsSync(OUT_DIR)) return new Set();
  return new Set(
    readdirSync(OUT_DIR)
      .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
      .map((f) => f.replace(/\.json$/, '')),
  );
}

function loadFromCatalog({ limit, allCatalog, shard }) {
  if (!existsSync(CATALOG_PATH)) return [];
  const cat = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  /** @type {Array<{ slug: string; name: string; lat: number; lon: number; radiusM: number }>} */
  const out = [];
  const seen = new Set([
    ...CURATED.map((c) => c.slug),
    ...existingGreenSlugs(),
    ...SKIP_CATALOG_SLUGS,
  ]);
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

function loadCourseFromCatalogBySlug(slug) {
  if (!existsSync(CATALOG_PATH) || !slug) return null;
  const cat = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  /** @type {Array<{ slug: string; name: string; lat: number; lon: number; radiusM: number; h: number | null }>} */
  const hits = [];
  for (const c of cat) {
    if (!catalogEligible(c)) continue;
    if (slugify(c.n) !== slug) continue;
    hits.push({
      slug,
      name: c.n,
      lat: c.la,
      lon: c.lo,
      radiusM: DEFAULT_RADIUS_M,
      h: c.h ?? null,
    });
  }
  if (!hits.length) return null;
  // Prefer full 18-hole layouts when duplicate names share a slug.
  hits.sort((a, b) => (b.h ?? 0) - (a.h ?? 0));
  const best = hits[0];
  return {
    slug: best.slug,
    name: best.name,
    lat: best.lat,
    lon: best.lon,
    radiusM: best.radiusM,
  };
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

function catalogHoleCount(name, lat, lon) {
  if (!existsSync(CATALOG_PATH)) return null;
  const cat = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  const n = String(name || '').toLowerCase();
  let best = null;
  let bestD = Infinity;
  for (const c of cat) {
    if (c.h == null) continue;
    if (String(c.n || '').toLowerCase() === n) return c.h;
    if (lat != null && lon != null && c.la != null && c.lo != null) {
      const d = haversineM(lat, lon, c.la, c.lo);
      if (d < bestD && d < 800) {
        bestD = d;
        best = c.h;
      }
    }
  }
  return best;
}

function loadIncompleteFromDisk() {
  /** @type {Array<{ slug: string; name: string; lat: number; lon: number; radiusM: number; targetHoles: number }>} */
  const out = [];
  if (!existsSync(OUT_DIR)) return out;
  for (const f of readdirSync(OUT_DIR)) {
    if (!f.endsWith('.json') || f === 'manifest.json') continue;
    try {
      const data = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8'));
      const holes = (data.greens ?? []).map((g) => g.hole);
      if (!holes.length) continue;
      const catalogH = catalogHoleCount(data.name, data.lat, data.lon);
      // Genuine 9-hole (or ≤10) courses are complete if they cover 1..N.
      const target =
        catalogH != null && catalogH <= 10
          ? catalogH
          : holes.length <= 10 && catalogH == null
            ? Math.max(...holes)
            : 18;
      const missing = [];
      for (let n = 1; n <= target; n++) {
        if (!holes.includes(n)) missing.push(n);
      }
      if (!missing.length) continue;
      out.push({
        slug: data.id || f.replace(/\.json$/, ''),
        name: data.name,
        lat: data.lat,
        lon: data.lon,
        radiusM: Math.max(DEFAULT_RADIUS_M, 2400),
        targetHoles: target,
      });
      console.log(
        `incomplete ${data.id || f}: have ${holes.length}/${target}, missing ${missing.join(',')}`,
      );
    } catch {
      /* skip */
    }
  }
  return out;
}

function loadCourseFromDisk(slug) {
  const p = join(OUT_DIR, `${slug}.json`);
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf8'));
    const catalogH = catalogHoleCount(data.name, data.lat, data.lon);
    return {
      slug: data.id || slug,
      name: data.name,
      lat: data.lat,
      lon: data.lon,
      radiusM: Math.max(DEFAULT_RADIUS_M, 2400),
      targetHoles: catalogH != null && catalogH <= 10 ? catalogH : 18,
    };
  } catch {
    return null;
  }
}

async function writeCourse(course, { skipExisting, minGreens, force }) {
  const outPath = join(OUT_DIR, `${course.slug}.json`);
  if (!force && skipExisting && existsSync(outPath)) {
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
  if (!course.maxLat && !course.minLat && !force) {
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
  const target = course.targetHoles ?? 18;
  if (data.greens.length < Math.min(MIN_MESH_HOLES, target)) {
    console.warn(
      `${course.slug}: only ${data.greens.length} meshes — not writing\n`,
    );
    return 'skipped-mesh';
  }

  // Prefer merging with previous pack so we never lose good holes on a partial rebuild.
  if (existsSync(outPath)) {
    try {
      const prev = JSON.parse(readFileSync(outPath, 'utf8'));
      const byHole = new Map();
      for (const g of prev.greens ?? []) byHole.set(g.hole, g);
      for (const g of data.greens) {
        const old = byHole.get(g.hole);
        if (!old || g.indices.length >= old.indices.length) byHole.set(g.hole, g);
      }
      data.greens = [...byHole.values()].sort((a, b) => a.hole - b.hole);
    } catch {
      /* overwrite */
    }
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
if (flags.has('complete-incomplete')) {
  queue = loadIncompleteFromDisk();
  if (!queue.length) {
    console.log('No incomplete green packs found.');
    writeManifest();
    process.exit(0);
  }
} else if (only.length) {
  const fromCurated = CURATED.filter((c) => only.includes(c.slug));
  const fromCatalog = only
    .map((slug) => loadCourseFromCatalogBySlug(slug))
    .filter(Boolean);
  const fromDisk = only
    .map((slug) => loadCourseFromDisk(slug))
    .filter(Boolean);
  const seen = new Set();
  queue = [...fromCurated, ...fromCatalog, ...fromDisk].filter((c) => {
    if (seen.has(c.slug)) return false;
    seen.add(c.slug);
    return true;
  });
  if (!queue.length) {
    console.error('No matching course slugs:', only);
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
      skipExisting: flags.has('skip-existing') && !flags.has('force'),
      minGreens,
      force: flags.has('force') || flags.has('complete-incomplete'),
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

