import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildVerifiedPack, assertNoDuplicateLayout, type Backup, type Batch } from '../scripts/lib/verifiedCoursePacks';
import { mappedSurfacesGeoJSON } from '../src/lib/golfSurfaceGeometry';

const batch: Batch = JSON.parse(readFileSync('data/course-expansion/osm-2026-10.json', 'utf8'));
const entry = batch.courses[0]!;
const source: Backup = JSON.parse(readFileSync(`public/golf/osm/${entry.slug}.json`, 'utf8'));

test('all batch packs reproduce exactly from attributed OSM snapshots', () => {
  assert.equal(batch.courses.length, 50);
  for (const entry of batch.courses) {
    const raw = readFileSync(`public/golf/osm/${entry.slug}.json`);
    assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sourceSha256);
    const expected = buildVerifiedPack(JSON.parse(raw.toString()), entry, batch);
    const actual = JSON.parse(readFileSync(`public/golf/holes/${entry.slug}.json`, 'utf8'));
    assert.deepEqual(actual, expected, entry.slug);
    assert.equal(actual.hasScorecard, false);
    for (const hole of actual.holes) {
      assert.equal(hole.tees, undefined, 'do not manufacture named tee sets');
      assert.equal(hole.provenance, 'geometric');
      assert.equal(hole.teeElevationM, undefined);
      assert.equal(hole.greenElevationM, undefined);
    }
  }
});

test('reject missing numbers, invented pars, and course identity mismatches', () => {
  const missing = structuredClone(source);
  missing.elements = missing.elements.filter(e => !(e.tags?.golf === 'hole' && e.tags.ref === '1'));
  assert.throws(() => buildVerifiedPack(missing, entry, batch), /incomplete/);
  const par = structuredClone(source);
  delete par.elements.find(e => e.tags?.golf === 'hole')!.tags!.par;
  assert.throws(() => buildVerifiedPack(par, entry, batch), /sourced par/);
  assert.throws(() => buildVerifiedPack(source, { ...entry, osmCourseId: -1 }, batch), /identity/);
});

test('reject a missing green polygon and a displaced course pin', () => {
  const pack = buildVerifiedPack(source, entry, batch);
  const missing = structuredClone(source);
  missing.elements = missing.elements.filter(e => e.id !== pack.holes[0]!.mappedSurfaces.green.osmWayId);
  assert.throws(() => buildVerifiedPack(missing, entry, batch), /tee\/green polygon/);
  assert.throws(() => buildVerifiedPack({ ...source, lat: 0, lon: 0 }, entry, batch), /outside/);
  assert.throws(() => assertNoDuplicateLayout(pack, [{ ...pack, slug: 'different-loop-name' }]), /overlaps/);
});

test('mapped surfaces retain source coordinates and deduplicate shared fairways', () => {
  const pack = buildVerifiedPack(source, entry, batch);
  const hole = pack.holes[0]!;
  const features = mappedSurfacesGeoJSON([hole, hole]).features;
  assert.equal(features.length, 2 + hole.mappedSurfaces.fairways.length);
  assert.deepEqual(features.find(f => f.properties?.kind === 'green')!.geometry.coordinates[0], hole.mappedSurfaces.green.ring.map(p => [p.lon, p.lat]));
  assert.deepEqual(mappedSurfacesGeoJSON([]).features, []);
});
