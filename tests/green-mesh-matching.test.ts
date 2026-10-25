import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchGreenMeshSlug, type GreenMeshManifest } from '../src/lib/golfGreen3d';
const manifest: GreenMeshManifest = {
  version: 1, count: 2, courses: [
    { slug: 'barton', name: 'Barton Golf Club', lat: 44.7, lon: -72.1, holes: 18 },
    { slug: 'north', name: 'North At Example Hills', lat: 40, lon: -74, holes: 18 },
  ],
};
test('a new course cannot borrow another course’s 3D pack by substring or proximity', () => {
  assert.equal(matchGreenMeshSlug(manifest, 'Dumbarton Golf Club', 55.95372, -4.57057), null);
  assert.equal(matchGreenMeshSlug(manifest, 'Dumbarton Golf Club'), null);
  assert.equal(matchGreenMeshSlug(manifest, 'Barton Golf Club', 55.95, -4.57), null);
  assert.equal(matchGreenMeshSlug(manifest, 'South At Example Hills', 40, -74), null);
  assert.equal(matchGreenMeshSlug(manifest, 'Unmapped Golf Club', 40, -74), null);
});
test('matching identity/location and unnamed coordinate lookup still work', () => {
  assert.equal(matchGreenMeshSlug(manifest, 'Barton Golf Club', 44.7, -72.1), 'barton');
  assert.equal(matchGreenMeshSlug(manifest, 'North At Example Hills', 40, -74), 'north');
  assert.equal(matchGreenMeshSlug(manifest, undefined, 40, -74), 'north');
});
