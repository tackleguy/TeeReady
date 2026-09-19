import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('public/sw.js', 'utf8');
function harness(response) {
  const entries = new Map();
  const listeners = new Map();
  const cache = { match: async r => entries.get(r.url), put: async (r, v) => entries.set(r.url, v), delete: async r => entries.delete(r.url), keys: async () => [...entries.keys()].map(url => new Request(url)) };
  let fetches = 0;
  const context = vm.createContext({
    self: { addEventListener: (n, fn) => listeners.set(n, fn) },
    location: { origin: 'https://example.test' }, URL, Response, Headers, Date,
    caches: { open: async () => cache, match: async r => cache.match(r) },
    fetch: async () => { fetches++; return response.clone(); },
  });
  vm.runInContext(source, context);
  return { context, entries, listeners, fetches: () => fetches };
}
for (const directive of ['no-store', 'private, max-age=600', 'no-cache']) {
  test(`service worker does not cache ${directive} responses`, async () => {
    const h = harness(Response.json({ secret: true }, { headers: { 'cache-control': directive } }));
    h.context.request = new Request('https://example.test/api/golf/hours');
    h.context.event = { waitUntil: () => {} };
    assert.equal((await vm.runInContext('cachedWeather(request)', h.context)).status, 200);
    assert.equal(h.entries.size, 0);
  });
}
test('fresh weather is reused without downloading it again', async () => {
  const h = harness(Response.json({ fresh: true }));
  const request = new Request('https://example.test/api/golf/hours');
  h.entries.set(request.url, Response.json({ cached: true }, { headers: { 'x-sw-cached-at': String(Date.now()) } }));
  h.context.request = request;
  assert.deepEqual(await (await vm.runInContext('cachedWeather(request)', h.context)).json(), { cached: true });
  assert.equal(h.fetches(), 0);
});
test('expired weather is refreshed', async () => {
  const h = harness(Response.json({ fresh: true }));
  const request = new Request('https://example.test/api/golf/hours');
  h.entries.set(request.url, Response.json({ cached: true }, { headers: { 'x-sw-cached-at': String(Date.now() - 6 * 60_000) } }));
  h.context.request = request;
  assert.deepEqual(await (await vm.runInContext('cachedWeather(request)', h.context)).json(), { fresh: true });
  assert.equal(h.fetches(), 1);
});
test('concurrent course downloads stay within the cache limit', async () => {
  const h = harness(Response.json({ pack: true }));
  h.context.requests = Array.from({ length: 20 }, (_, i) => new Request(`https://example.test/golf/holes/${i}.json`));
  await vm.runInContext('Promise.all(requests.map(r => cacheFirst(r, COURSE_CACHE, 12)))', h.context);
  assert.equal(h.entries.size, 12);
  assert.equal(h.entries.has('https://example.test/golf/holes/0.json'), false);
});
test('authenticated requests and caddy status bypass the service worker cache', () => {
  const h = harness(Response.json({}));
  for (const request of [new Request('https://example.test/api/caddy'), new Request('https://example.test/api/golf/hours', { headers: { authorization: 'Bearer token' } })]) {
    let intercepted = false;
    h.listeners.get('fetch')({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
