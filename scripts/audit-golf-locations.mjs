#!/usr/bin/env node
/**
 * Audit golf course / hole location data across catalog, venues, and asset packs.
 *
 * Usage: node scripts/audit-golf-locations.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

function validCoord(lat, lon) {
  if (lat == null || lon == null) return 'null';
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 'non-finite';
  if (lat === 0 && lon === 0) return '0,0';
  if (lat < -90 || lat > 90) return 'lat out of range';
  if (lon < -180 || lon > 180) return 'lon out of range';
  return null;
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

const findings = [];
function add(severity, source, name, detail) {
  findings.push({ severity, source, name, detail });
}

const catalog = readJson('api/golf/_data/usCatalog.json');
const publicCat = readJson('public/golf/catalog.us.json');
const venues = readJson('src/data/venues.courses.json');
const greensManifest = readJson('public/golf/greens/manifest.json');
const holesManifest = existsSync(join(ROOT, 'public/golf/holes/manifest.json'))
  ? readJson('public/golf/holes/manifest.json')
  : { courses: [] };

const greensBySlug = new Map(greensManifest.courses.map((c) => [c.slug, c]));
const venuesBySlug = new Map(venues.map((v) => [v.slug, v]));

console.log('Catalog entries:', catalog.length);
console.log('Venues courses:', venues.length);
console.log('Greens manifest:', greensManifest.count);
console.log('Hole packs:', holesManifest.count ?? holesManifest.courses?.length ?? 0);

for (const e of catalog) {
  const bad = validCoord(e.la, e.lo);
  if (bad) add('error', 'catalog', e.n, bad);
  if (e.co === 'US' && (e.la < 18 || e.la > 72 || e.lo < -180 || e.lo > -60)) {
    add('error', 'catalog', e.n, `US coords out of bounds (${e.la}, ${e.lo})`);
  }
}

if (publicCat.length !== catalog.length) {
  add('error', 'public-catalog', 'length', `${publicCat.length} != ${catalog.length}`);
}

for (const v of venues) {
  const bad = validCoord(v.center?.lat, v.center?.lon);
  if (bad) add('error', 'venues', v.name, bad);
  const catMatches = catalog.filter((c) => c.n.toLowerCase() === v.name.toLowerCase());
  if (!catMatches.length) {
    add('warn', 'venues', v.name, 'no exact catalog name match');
    continue;
  }
  const regionSt = (v.region.match(/,\s*([A-Z]{2})$/) || [])[1];
  const byState = regionSt ? catMatches.filter((c) => c.st === regionSt) : [];
  const pick =
    byState.length === 1
      ? byState[0]
      : catMatches.find((c) => haversineM(v.center.lat, v.center.lon, c.la, c.lo) < 5000) ??
        catMatches[0];
  const d = haversineM(v.center.lat, v.center.lon, pick.la, pick.lo);
  if (d > 5000) {
    add(
      'error',
      'venues-catalog',
      v.name,
      `coords ${Math.round(d)}m from catalog branch (${pick.ci}, ${pick.st})`,
    );
  }
  if (regionSt && pick.st !== regionSt) {
    add('error', 'venues-catalog', v.name, `region ${v.region} but catalog is ${pick.ci}, ${pick.st}`);
  }
}

for (const g of greensManifest.courses) {
  const bad = validCoord(g.lat, g.lon);
  if (bad) add('error', 'greens-manifest', g.slug, bad);
  const v = venuesBySlug.get(g.slug);
  if (v) {
    const d = haversineM(g.lat, g.lon, v.center.lat, v.center.lon);
    if (d > 100) {
      add('error', 'greens-venues', g.slug, `manifest vs venues differ ${Math.round(d)}m`);
    }
  }
  const file = join(ROOT, 'public/golf/greens', `${g.slug}.json`);
  if (!existsSync(file)) {
    add('error', 'greens-manifest', g.slug, 'manifest entry missing green pack file');
  }
}

for (const v of venues) {
  if (v.hasGreenMesh && !greensBySlug.has(v.slug)) {
    add('warn', 'venues', v.slug, 'hasGreenMesh but no greens manifest entry');
  }
}

const holesDir = join(ROOT, 'public/golf/holes');
if (existsSync(holesDir)) {
  for (const file of readdirSync(holesDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    const pack = readJson(`public/golf/holes/${file}`);
    const bad = validCoord(pack.lat, pack.lon);
    if (bad) add('error', 'hole-pack', pack.name, `center ${bad}`);
    let maxDist = 0;
    for (const h of pack.holes ?? []) {
      for (const pt of [h.tee, h.green]) {
        if (!pt) continue;
        const pb = validCoord(pt.lat, pt.lon);
        if (pb) add('error', 'hole-pack', `${pack.slug} h${h.number}`, pb);
        maxDist = Math.max(maxDist, haversineM(pack.lat, pack.lon, pt.lat, pt.lon));
      }
    }
    if (maxDist > 5000) {
      add('error', 'hole-pack', pack.slug, `hole point ${Math.round(maxDist)}m from center`);
    }
  }
}

const suspicious = /sports bar|grill|restaurant|19th hole sports|short\/executive course/i;
for (const g of greensManifest.courses) {
  if (suspicious.test(g.name)) {
    add('warn', 'greens-manifest', g.name, 'suspicious non-course name');
  }
}

const errors = findings.filter((f) => f.severity === 'error');
const warns = findings.filter((f) => f.severity === 'warn');
console.log(`\nErrors: ${errors.length}`);
console.log(`Warnings: ${warns.length}`);
for (const f of errors) console.log(`[error] ${f.source} ${f.name}: ${f.detail}`);
for (const f of warns.slice(0, 30)) console.log(`[warn] ${f.source} ${f.name}: ${f.detail}`);
if (warns.length > 30) console.log(`... ${warns.length - 30} more warnings`);

if (errors.length) process.exitCode = 1;
