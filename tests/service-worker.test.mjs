import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('public/sw.js', 'utf8');
function harness(response) {
  const entries = new Map();
  const listeners = new Map();
  const cache = { match: async r => entries.get(r.url), put: async (r, v) => entries.set(r.url, v), delete: async r => entries.delete(r.url) };
  const context = vm.createContext({
    self: { addEventListener: (n, fn) => listeners.set(n, fn) },
    location: { origin: 'https://example.test' }, URL, Response, Headers, Date,
    caches: { open: async () => cache, match: async r => cache.match(r) },
    fetch: async () => response.clone(),
  });
  vm.runInContext(source, context);
  return { context, entries, listeners };
}
for (const directive of ['no-store', 'private, max-age=600', 'no-cache']) {
  test(`service worker does not cache ${directive} responses`, async () => {
    const h = harness(Response.json({ secret: true }, { headers: { 'cache-control': directive } }));
    h.context.request = new Request('https://example.test/api/golf/hours');
    h.context.event = { waitUntil: () => {} };
    assert.equal((await vm.runInContext('staleWhileRevalidate(request, event)', h.context)).status, 200);
    assert.equal(h.entries.size, 0);
  });
}
test('service worker extends lifetime of background refreshes', async () => {
  const h = harness(Response.json({ fresh: true }));
  const request = new Request('https://example.test/api/golf/hours');
  h.entries.set(request.url, Response.json({ cached: true }, { headers: { 'x-sw-cached-at': String(Date.now()) } }));
  let pending;
  h.context.request = request;
  h.context.event = { waitUntil: promise => { pending = promise; } };
  assert.deepEqual(await (await vm.runInContext('staleWhileRevalidate(request, event)', h.context)).json(), { cached: true });
  assert.ok(pending);
  await pending;
  assert.deepEqual(await h.entries.get(request.url).json(), { fresh: true });
});
test('authenticated requests and caddy status bypass the service worker cache', () => {
  const h = harness(Response.json({}));
  for (const request of [new Request('https://example.test/api/caddy'), new Request('https://example.test/api/golf/hours', { headers: { authorization: 'Bearer token' } })]) {
    let intercepted = false;
    h.listeners.get('fetch')({ request, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
