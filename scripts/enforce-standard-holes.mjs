#!/usr/bin/env node
/**
 * Keep course + 3D green data on standard layouts only (9 or 18 holes).
 * - Drops incomplete / non-standard green packs
 * - Backfills catalog `h` from green packs + name hints
 * - Removes known non-9/18 catalog entries
 * - Rewrites greens manifest
 */
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GREENS_DIR = join(ROOT, 'public/golf/greens');
const API_CATALOG = join(ROOT, 'api/golf/_data/usCatalog.json');
const PUBLIC_CATALOG = join(ROOT, 'public/golf/catalog.us.json');
const API_CATALOG_TS = join(ROOT, 'api/golf/_data/usCatalog.ts');

function isStandardHoleCount(n) {
  return n === 9 || n === 18;
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferHolesFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/\b9[-\s]?hole\b|\bnine[-\s]?hole\b|\bexecutive\s+nine\b|\bshort\s+nine\b/.test(n)) {
    return 9;
  }
  if (/\b18[-\s]?hole\b|\beighteen[-\s]?hole\b/.test(n)) return 18;
  if (/\bthe\s+chain\b/.test(n)) return null; // StreamsSong Chain is 19
  return null;
}

function packIsComplete(greens) {
  if (!Array.isArray(greens) || !greens.length) return false;
  const holes = greens.map((g) => g.hole).filter((h) => Number.isFinite(h));
  if (!isStandardHoleCount(holes.length)) return false;
  const target = holes.length;
  for (let i = 1; i <= target; i++) {
    if (!holes.includes(i)) return false;
  }
  return true;
}

function writeManifest(kept) {
  const entries = kept
    .map(({ slug, data }) => ({
      slug,
      name: data.name,
      lat: data.lat,
      lon: data.lon,
      holes: data.greens.length,
      holeNumbers: data.greens.map((g) => g.hole).sort((a, b) => a - b),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const manifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    count: entries.length,
    courses: entries,
  };
  writeFileSync(join(GREENS_DIR, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
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

function backfillCatalog(catalog, greenIndex) {
  let filled = 0;
  let removed = 0;
  const out = [];
  for (const entry of catalog) {
    let h = entry.h;
    if (h != null && !isStandardHoleCount(h)) {
      removed += 1;
      continue;
    }
    if (h == null) {
      const fromName = inferHolesFromName(entry.n);
      if (fromName) {
        h = fromName;
        filled += 1;
      } else {
        const slug = slugify(entry.n);
        const bySlug = greenIndex.bySlug.get(slug);
        if (bySlug) {
          h = bySlug;
          filled += 1;
        } else if (entry.la != null && entry.lo != null) {
          let best = null;
          let bestD = Infinity;
          for (const g of greenIndex.list) {
            const d = haversineM(entry.la, entry.lo, g.lat, g.lon);
            if (d < bestD && d < 600) {
              bestD = d;
              best = g.holes;
            }
          }
          if (best) {
            h = best;
            filled += 1;
          }
        }
      }
    }
    if (h != null && !isStandardHoleCount(h)) {
      removed += 1;
      continue;
    }
    if (h != null) entry.h = h;
    // Keep unknown hole counts (backfill later); only drop known non-9/18.
    out.push(entry);
  }
  return { out, filled, removed };
}

function publicEntry(e) {
  return {
    n: e.n,
    la: e.la,
    lo: e.lo,
    r: [e.ci, e.st || e.pr].filter(Boolean).join(', ') || undefined,
    co: e.co,
    h: e.h,
    p: e.p,
    typ: e.typ,
    q: e.q,
  };
}

function rewriteCatalogTs(count) {
  if (!existsSync(API_CATALOG_TS)) return;
  // File is import-based — leave structure; JSON is source of truth.
  void count;
}

// --- greens ---
const removedGreens = [];
const kept = [];
for (const f of readdirSync(GREENS_DIR)) {
  if (!f.endsWith('.json') || f === 'manifest.json') continue;
  const path = join(GREENS_DIR, f);
  try {
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!packIsComplete(data.greens)) {
      unlinkSync(path);
      removedGreens.push({
        file: f,
        holes: data.greens?.length ?? 0,
        nums: (data.greens ?? []).map((g) => g.hole).sort((a, b) => a - b),
      });
      continue;
    }
    kept.push({ slug: data.id || f.replace(/\.json$/, ''), data });
  } catch (err) {
    console.warn(`skip bad file ${f}:`, err.message);
  }
}

const manifest = writeManifest(kept);
console.log(
  `Greens: kept ${kept.length} (9/18 only), removed ${removedGreens.length}`,
);
for (const r of removedGreens) {
  console.log(`  - ${r.file}: ${r.holes} greens [${r.nums.join(',')}]`);
}

const greenIndex = {
  bySlug: new Map(kept.map(({ slug, data }) => [slug, data.greens.length])),
  list: kept.map(({ data }) => ({
    lat: data.lat,
    lon: data.lon,
    holes: data.greens.length,
    name: data.name,
  })),
};

// --- catalog ---
const apiCat = JSON.parse(readFileSync(API_CATALOG, 'utf8'));
const before = apiCat.length;
const { out, filled, removed } = backfillCatalog(apiCat, greenIndex);
writeFileSync(API_CATALOG, JSON.stringify(out));
writeFileSync(
  PUBLIC_CATALOG,
  JSON.stringify(out.map(publicEntry)),
);
rewriteCatalogTs(out.length);

console.log(
  `Catalog: ${before} → ${out.length} (backfilled h on ${filled}, removed ${removed})`,
);
console.log(`Manifest count: ${manifest.count}`);
