import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindProfileOwner, profileOwner } from '../src/lib/profileOwnership';

test('account switches reset local profile before assigning a new owner', () => {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => entries.set(key, value) } });
  let profile = 'guest';
  let resets = 0;
  const reset = () => { profile = 'default'; resets++; };
  assert.equal(bindProfileOwner('alice', reset), false);
  assert.equal(profile, 'guest', 'first signup can retain guest questionnaire');
  profile = 'alice-private-profile';
  assert.equal(bindProfileOwner('alice', reset), true);
  assert.equal(resets, 0);
  assert.equal(bindProfileOwner('bob', reset), false);
  assert.equal(profile, 'default');
  assert.equal(profileOwner(), 'bob');
  assert.equal(resets, 1);
  delete (globalThis as { localStorage?: Storage }).localStorage;
});
