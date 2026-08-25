#!/usr/bin/env node
/**
 * Build 3D green mesh JSON from free OSM polygons + USGS 3DEP elevation.
 * Output: public/golf/greens/{slug}.json
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public/golf/greens');
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USGS =
  'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage';
const UA = 'TeeReady/1.0 (green-mesh-builder)';

/** @type {Array<{ slug: string; name: string; lat: number; lon: number; radiusM: number; maxLat?: number; minLat?: number }>} */
const COURSES = [
  {
    slug: 'torrey-pines-south',
    name: 'South At Torrey Pines Municipal Golf Course',
    lat: 32.90246,
    lon: -117.24627,
    radiusM: 2200,
    /** Drop North Course / practice greens north of this latitude. */
    maxLat: 32.904,
  },
  {
    slug: 'torrey-pines-north',
    name: 'North At Torrey Pines Municipal Golf Course',
    lat: 32.90467,
    lon: -117.24462,
    radiusM: 2200,
    /** Drop South Course greens south of this latitude. */
    minLat: 32.904,
  },
  {
    slug: 'pebble-beach',
    name: 'Pebble Beach Golf Links',
    lat: 36.56071,
    lon: -121.9296,
    radiusM: 1400,
  },
];

const GRID_M = 0.85;
const PAD_M = 6;

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

async function overpass(query, { urls = OVERPASS_URLS } = {}) {
  let lastErr = 'Overpass failed';
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
        lastErr = `${url} ${res.status}`;
        continue;
      }
      return res.json();
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
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
        Math.round(x * 1000) / 1000,
        Math.round((elev - baseElev) * 1000) / 1000,
        Math.round(y * 1000) / 1000,
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

mkdirSync(OUT_DIR, { recursive: true });

const only = new Set(process.argv.slice(2).filter((a) => !a.startsWith('-')));
const queue = only.size
  ? COURSES.filter((c) => only.has(c.slug))
  : COURSES;

for (const course of queue) {
  try {
    const data = await buildCourse(course);
    const outPath = join(OUT_DIR, `${course.slug}.json`);
    writeFileSync(outPath, JSON.stringify(data));
    const holes = data.greens.map((g) => g.hole).join(',');
    console.log(
      `Wrote ${outPath} (${data.greens.length} greens · holes ${holes})\n`,
    );
  } catch (err) {
    console.error(`${course.slug} failed:`, err);
    process.exitCode = 1;
  }
}
