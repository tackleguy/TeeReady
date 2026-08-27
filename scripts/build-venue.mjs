#!/usr/bin/env node
/**
 * Venue builder — add a course or a driving range without hand-editing JSON.
 *
 * Usage:
 *   node scripts/build-venue.mjs --range   --name "Aviara Golf Range" --lat 33.09 --lon -117.28 \
 *                                --region "Carlsbad, CA" --bearing 275 --targets 50,100,150,200,250
 *   node scripts/build-venue.mjs --course  --name "Papago Golf Course" --lat 33.46 --lon -111.95 \
 *                                --region "Phoenix, AZ" --holes 18 --par 72
 *   node scripts/build-venue.mjs --validate           # re-check everything already added
 *
 * Writes to src/data/venues.user.json. Never touches the OSM-derived catalog —
 * user-added venues stay in their own file so a catalog rebuild can't wipe them
 * and a bad hand entry can't corrupt the 14k-course dataset.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src/data/venues.user.json');

// ── validation ──────────────────────────────────────────────────────────────
// Every rule here exists because the corresponding bad row was found in the
// real catalog. A venue that fails validation is rejected, not "warned about" —
// bad geo data is invisible until a golfer is standing in the wrong place.

const RULES = [
  {
    id: 'lat-range',
    test: (v) => Number.isFinite(v.center.lat) && Math.abs(v.center.lat) <= 90,
    msg: 'latitude must be a finite number within ±90',
  },
  {
    id: 'lon-range',
    test: (v) => Number.isFinite(v.center.lon) && Math.abs(v.center.lon) <= 180,
    msg: 'longitude must be a finite number within ±180',
  },
  {
    id: 'null-island',
    test: (v) => v.center.lat !== 0 || v.center.lon !== 0,
    msg: 'coordinates are 0,0 — the placeholder was never filled in',
  },
  {
    id: 'region-format',
    test: (v) => /^[^,]+,\s*[A-Z]{2}$/.test(v.region || ''),
    msg: 'region must look like "City, ST"',
  },
  {
    id: 'region-vs-coords',
    // Catches the real bug: a BC course labelled "Qualicum Beach, NY".
    test: (v) => {
      const st = (v.region || '').split(',').pop().trim();
      const box = STATE_BOXES[st];
      if (!box) return true; // unknown state code — checked by region-format
      const { lat, lon } = v.center;
      return lat >= box[0] && lat <= box[2] && lon >= box[1] && lon <= box[3];
    },
    msg: 'coordinates do not fall inside the state named in the region string',
  },
  {
    id: 'course-par',
    test: (v) =>
      v.kind !== 'course' ||
      (v.holes === 9 ? v.par >= 27 && v.par <= 40 : v.par >= 54 && v.par <= 76),
    msg: 'par is impossible for that hole count',
  },
  {
    id: 'range-targets',
    test: (v) =>
      v.kind === 'course' ||
      (Array.isArray(v.targets) &&
        v.targets.length > 0 &&
        v.targets.every((t) => t.yards > 0 && t.yards < 400) &&
        new Set(v.targets.map((t) => t.yards)).size === v.targets.length),
    msg: 'range needs at least one target, all 1–399 yards, no duplicates',
  },
  {
    id: 'range-bearing',
    test: (v) => v.kind === 'course' || (v.bearingDeg >= 0 && v.bearingDeg < 360),
    msg: 'bearing must be 0–359 degrees',
  },
];

/** Coarse state bounding boxes: [minLat, minLon, maxLat, maxLon]. Extend as needed. */
const STATE_BOXES = {
  AZ: [31.3, -114.9, 37.1, -109.0],
  CA: [32.5, -124.5, 42.1, -114.1],
  CO: [36.9, -109.1, 41.1, -102.0],
  FL: [24.4, -87.7, 31.1, -79.9],
  GA: [30.3, -85.7, 35.1, -80.8],
  NC: [33.8, -84.4, 36.6, -75.4],
  NY: [40.4, -79.8, 45.1, -71.8],
  TX: [25.8, -106.7, 36.6, -93.5],
};

function validate(v) {
  return RULES.filter((r) => !r.test(v)).map((r) => `${r.id}: ${r.msg}`);
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── args ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const FLAGS = { '--range': ['kind', 'range'], '--course': ['kind', 'course'], '--validate': ['validateOnly', true] };
  const out = {};
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (FLAGS[a]) {
      const [k, v] = FLAGS[a];
      out[k] = v;
      continue;
    }
    const m = a.match(/^--([a-zA-Z]+)(?:=(.*))?$/);
    if (!m) continue;
    if (m[2] !== undefined) {
      out[m[1]] = m[2];                     // --key=value
    } else if (args[i + 1] && !args[i + 1].startsWith('--')) {
      out[m[1]] = args[i + 1];              // --key value
      i += 1;
    } else {
      out[m[1]] = 'true';                   // bare boolean flag
    }
  }
  return out;
}

function load() {
  if (!existsSync(OUT)) return [];
  try {
    const parsed = JSON.parse(readFileSync(OUT, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`${OUT} is not valid JSON — refusing to overwrite it.`);
    process.exit(1);
  }
}

function save(venues) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(venues, null, 2)}\n`);
}

// ── main ────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv);
const venues = load();

if (args.validateOnly) {
  let bad = 0;
  for (const v of venues) {
    const errs = validate(v);
    if (errs.length) {
      bad += 1;
      console.error(`✗ ${v.name}`);
      for (const e of errs) console.error(`    ${e}`);
    }
  }
  console.log(`\n${venues.length} venues, ${bad} invalid.`);
  process.exit(bad ? 1 : 0);
}

if (!args.kind) {
  console.error('Pass --course or --range. See the header of this file for examples.');
  process.exit(1);
}
if (!args.name || args.lat === undefined || args.lon === undefined) {
  console.error('--name, --lat and --lon are required.');
  process.exit(1);
}

const center = { lat: Number(args.lat), lon: Number(args.lon) };

const venue =
  args.kind === 'course'
    ? {
        slug: slugify(args.name),
        name: args.name,
        kind: 'course',
        center,
        region: args.region || '',
        source: 'user-added',
        holes: Number(args.holes || 18),
        par: Number(args.par || 72),
        type: args.type || 'regulation',
      }
    : {
        slug: slugify(args.name),
        name: args.name,
        kind: 'range',
        center,
        hittingLine: {
          lat: Number(args.hitLat ?? args.lat),
          lon: Number(args.hitLon ?? args.lon),
        },
        bearingDeg: Number(args.bearing || 0),
        region: args.region || '',
        source: 'user-added',
        surface: args.surface || 'unknown',
        covered: args.covered === 'true',
        limitedFlightBalls: args.limitedBalls === 'true' ? true : 'unknown',
        targets: String(args.targets || '50,100,150,200')
          .split(',')
          .map((y) => Number(y.trim()))
          .filter((y) => Number.isFinite(y))
          .sort((a, b) => a - b)
          .map((yards) => ({ yards, label: String(yards) })),
      };

const errors = validate(venue);
if (errors.length) {
  console.error(`✗ ${venue.name} rejected:`);
  for (const e of errors) console.error(`    ${e}`);
  console.error('\nNothing was written.');
  process.exit(1);
}

if (venues.some((v) => v.slug === venue.slug)) {
  console.error(`A venue with slug "${venue.slug}" already exists. Rename or remove it first.`);
  process.exit(1);
}

venues.push(venue);
save(venues);

console.log(`✓ Added ${venue.name} (${venue.slug})`);
console.log(`  ${venues.length} user venues in ${OUT.replace(ROOT, '.')}`);
if (venue.kind === 'range' && venue.limitedFlightBalls === 'unknown') {
  console.log(
    '\n  Note: ball type unknown. If this range uses limited-flight balls, carry\n' +
      '  numbers will read 10–20% short and should not train the club database.\n' +
      '  Re-add with --limitedBalls=true once you know.',
  );
}
