/**
 * Geographic invariants for GPS / hole packs.
 * Run: npx tsx scripts/test-geo-accuracy.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { geodesicYards } from '../src/lib/geodesic.ts';
import {
  annotateHoleGeo,
  identifyHoleFromGps,
  isFabricatedSouthTee,
  inspectLayoutGeo,
  FABRICATED_TEE_LAT_OFFSET,
  flagDuplicateCourses,
} from '../src/lib/geoAccuracy.ts';
import { greenMarks } from '../src/lib/golfMeasure.ts';
import type { GolfHole } from '../src/lib/golf.ts';
import {
  namesConflict,
  namesLooselyMatch,
  pickPolygonForCourse,
} from '../api/golf/_lib/courseRelate.ts';
import { deriveHolesFromOsmElements } from '../api/golf/holes.ts';
import { scopeHolesToSelectedCourse } from '../src/lib/golfHolesNormalize.ts';

function hole(
  n: number,
  tee: { lat: number; lon: number },
  green: { lat: number; lon: number },
  extra?: Partial<GolfHole>,
): GolfHole {
  return {
    number: n,
    yards: 400,
    bearingDeg: 0,
    tee,
    green,
    source: 'hole-way',
    path: [tee, green],
    ...extra,
  };
}

// Geodesic: 0.001° latitude ≈ 109–122 yd
const eqYd = geodesicYards(0, 0, 0.001, 0);
assert.ok(eqYd > 108 && eqYd < 125, `0.001° lat should be ~121 yd, got ${eqYd}`);

const fabricatedGreen = { lat: 33.5, lon: -117.2 };
const fabricatedTee = {
  lat: fabricatedGreen.lat - FABRICATED_TEE_LAT_OFFSET,
  lon: fabricatedGreen.lon,
};
assert.equal(isFabricatedSouthTee(fabricatedTee, fabricatedGreen), true);

const flagged = annotateHoleGeo(hole(1, fabricatedTee, fabricatedGreen));
assert.equal(flagged.geo?.confidence, 'UNVERIFIED');
assert.ok(flagged.geo?.issues.some((i) => i.code === 'FABRICATED_TEE'));

const real = annotateHoleGeo(
  hole(1, { lat: 32.904, lon: -117.245 }, { lat: 32.907, lon: -117.243 }),
);
assert.notEqual(real.geo?.confidence, 'UNVERIFIED');
assert.ok(!real.geo?.issues.some((i) => i.code === 'FABRICATED_TEE'));

const marks = greenMarks(real);
assert.equal(marks.frontBackVerified, false);
assert.equal(marks.front.lat, real.green.lat);

const polyMarks = greenMarks(real, {
  polygon: [
    { lat: 32.9068, lon: -117.2432 },
    { lat: 32.9072, lon: -117.2432 },
    { lat: 32.9072, lon: -117.2428 },
    { lat: 32.9068, lon: -117.2428 },
  ],
});
assert.equal(polyMarks.frontBackVerified, true);

const h1 = hole(1, { lat: 32.9, lon: -117.25 }, { lat: 32.902, lon: -117.248 });
const h2 = hole(2, { lat: 32.903, lon: -117.247 }, { lat: 32.905, lon: -117.246 });
const onH1 = identifyHoleFromGps({
  lat: 32.901,
  lon: -117.249,
  accuracyM: 6,
  holes: [h1, h2],
  previousHole: 1,
});
assert.equal(onH1?.holeNumber, 1);

const h3 = hole(3, { lat: 32.906, lon: -117.245 }, { lat: 32.908, lon: -117.244 });
const gaps = inspectLayoutGeo([h1, h3]);
assert.ok(gaps.some((i) => i.code === 'HOLE_NUMBER_GAP'));

const dups = flagDuplicateCourses([
  { name: 'Same Club', lat: 40.0, lon: -74.0, slug: 'a' },
  { name: 'Same Club', lat: 40.0005, lon: -74.0, slug: 'b' },
]);
assert.ok(dups.some((i) => i.code === 'DUPLICATE_COURSE'));

const siblings = flagDuplicateCourses([
  { name: 'North at Example Hills', lat: 40.0, lon: -74.0, slug: 'n' },
  { name: 'South at Example Hills', lat: 40.0005, lon: -74.0, slug: 's' },
]);
assert.ok(!siblings.some((i) => i.code === 'DUPLICATE_COURSE'));

assert.equal(namesConflict('Wilson At Griffith Park Golf Courses', 'Harding Golf Course'), true);
assert.equal(namesConflict('North At Torrey Pines', 'Torrey Pines South Course'), true);
assert.equal(namesConflict('Harding At Griffith Park Golf Courses', 'Harding Golf Course'), false);
assert.equal(namesLooselyMatch('Balboa At Sepulveda Golf Complex', 'Balboa Municipal Golf Course'), true);
assert.equal(namesLooselyMatch('Balboa At Sepulveda Golf Complex', 'Encino Municipal Golf Course'), false);

const polyPick = pickPolygonForCourse(
  [
    { id: 1, name: 'Torrey Pines North Course' },
    { id: 2, name: 'Torrey Pines South Course' },
  ],
  'South At Torrey Pines Municipal Golf Course',
);
assert.equal(polyPick?.id, 2);

const mixed = [
  hole(1, { lat: 32.91, lon: -117.245 }, { lat: 32.911, lon: -117.244 }, { loop: 'North' }),
  hole(1, { lat: 32.90, lon: -117.25 }, { lat: 32.901, lon: -117.249 }, { loop: 'South' }),
  hole(2, { lat: 32.912, lon: -117.246 }, { lat: 32.913, lon: -117.245 }, { loop: 'North' }),
  hole(2, { lat: 32.899, lon: -117.251 }, { lat: 32.90, lon: -117.25 }, { loop: 'South' }),
];
const northOnly = scopeHolesToSelectedCourse(
  mixed,
  'North At Torrey Pines Municipal Golf Course',
);
assert.equal(northOnly.length, 2);
assert.ok(northOnly.every((h) => h.loop === 'North'));

function loadOsm(slug: string) {
  return JSON.parse(
    readFileSync(`/Users/maxr/TeeReady/public/golf/osm/${slug}.json`, 'utf8'),
  );
}

const wilson = deriveHolesFromOsmElements(loadOsm('wilson-at-griffith-park-golf-courses').elements, {
  courseName: 'Wilson At Griffith Park Golf Courses',
});
const harding = deriveHolesFromOsmElements(loadOsm('harding-at-griffith-park-golf-courses').elements, {
  courseName: 'Harding At Griffith Park Golf Courses',
});
assert.equal(wilson.length, 18, `Wilson holes ${wilson.length}`);
assert.equal(harding.length, 18, `Harding holes ${harding.length}`);
const wGreen = `${wilson[0]!.green.lat.toFixed(5)},${wilson[0]!.green.lon.toFixed(5)}`;
const hGreen = `${harding[0]!.green.lat.toFixed(5)},${harding[0]!.green.lon.toFixed(5)}`;
assert.notEqual(wGreen, hGreen, 'Wilson and Harding must not share hole 1');

const tNorth = deriveHolesFromOsmElements(loadOsm('torrey-pines-north').elements, {
  courseName: 'North At Torrey Pines Municipal Golf Course',
});
const tSouth = deriveHolesFromOsmElements(loadOsm('torrey-pines-south').elements, {
  courseName: 'South At Torrey Pines Municipal Golf Course',
});
assert.equal(tNorth.length, 18);
assert.equal(tSouth.length, 18);
assert.ok(tNorth.every((h) => (h.loop ?? 'North') !== 'South'));
assert.ok(!tSouth.some((h) => h.loop === 'North'));
const maxNorthLat = Math.max(...tNorth.map((h) => h.green.lat));
const minSouthLat = Math.min(...tSouth.map((h) => h.green.lat));
assert.ok(maxNorthLat >= minSouthLat - 0.02);

console.log('PASS: geo accuracy invariants');
