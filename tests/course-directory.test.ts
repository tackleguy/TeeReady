import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { directoryCourses, directoryEntries, directoryGreens } from '../src/lib/courseDirectory';
test('directory covers every supported shipped hole pack', () => {
  const manifest = JSON.parse(readFileSync('public/golf/holes/manifest.json', 'utf8'));
  const expected = manifest.courses.filter((e: { holes: number }) => e.holes === 9 || e.holes === 18);
  assert.equal(directoryEntries.length, expected.length);
  assert.equal(new Set(directoryEntries.map(e => e.slug)).size, expected.length);
  const greens = JSON.parse(readFileSync('public/golf/greens/manifest.json', 'utf8'));
  assert.equal(directoryGreens.length, greens.courses.filter((e: { holes: number }) => [9,18].includes(e.holes)).length);
});
test('nearby lists are bounded and sorted; search covers distant courses', () => {
  const nearby = directoryCourses(47.6, -122.3);
  assert.equal(nearby.length, 48);
  assert.ok(nearby.every((c,i) => i === 0 || c.distanceMi! >= nearby[i-1]!.distanceMi!));
  const far = directoryCourses(47.6, -122.3, 'Augusta National');
  assert.ok(far.some(c => c.name.includes('Augusta National')));
  assert.deepEqual(directoryCourses(47.6, -122.3, 'zzz-no-such-course-zzz'), []);
});
test('repeat reads retain row identity and location changes cannot reuse stale distances', () => {
  const first = directoryCourses(47.6, -122.3);
  assert.equal(first[0], directoryCourses(47.6, -122.3)[0]);
  const other = directoryCourses(33.5, -84.4);
  assert.notEqual(first[0]!.id, other[0]!.id);
  assert.equal(directoryCourses(47.6, -122.3, '', Infinity).length, directoryEntries.length);
  assert.deepEqual(directoryCourses(NaN, 0), []);
});
