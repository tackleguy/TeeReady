import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../api/_lib/http';
import { rateLimit } from '../api/_lib/rateLimit';
import geocode from '../api/geocode';
import courses from '../api/golf/courses';
import holes from '../api/golf/holes';
import hours from '../api/golf/hours';
import ensemble from '../api/golf/ensemble';
import notebook from '../api/golf/notebook';
import caddy from '../api/caddy';

const url = 'https://example.test/api/test';
const getHandlers = { courses, holes, hours, ensemble, notebook };
for (const [name, handler] of Object.entries(getHandlers)) {
  test(`${name} rejects missing, blank and out-of-range coordinates`, async () => {
    for (const query of ['', '?lat=&lon=', '?lat=91&lon=0', '?lat=0&lon=181', '?lat=NaN&lon=0']) {
      assert.equal((await handler(new Request(url + query))).status, 400, query);
    }
    const response = await handler(new Request(url, { method: 'DELETE' }));
    assert.equal(response.status, 405);
    assert.ok(response.headers.get('allow'));
  });
}
for (const [name, handler] of Object.entries({ ensemble, notebook })) {
  test(`${name} rejects malformed hole bodies before fetching providers`, async () => {
    for (const body of ['null', '{', JSON.stringify({ lat: null, lon: null }), JSON.stringify({ lat: 30, lon: 20, holes: [null] }), JSON.stringify({ lat: 30, lon: 20, holes: {} })]) {
      assert.equal((await handler(new Request(url, { method: 'POST', body }))).status, 400);
    }
  });
}
test('bounded JSON reader rejects declared and streamed oversized requests', async () => {
  for (const request of [new Request(url, { method: 'POST', body: '{}', headers: { 'content-length': '100' } }), new Request(url, { method: 'POST', body: JSON.stringify('a'.repeat(100)) })]) {
    await assert.rejects(readJson(request, 20), (error: unknown) => error instanceof Response && error.status === 413);
  }
  assert.deepEqual(await readJson(new Request(url, { method: 'POST', body: '{"ok":true}' })), { ok: true });
});
test('caddy rejects huge payloads without contacting an upstream', async () => {
  assert.equal((await caddy(new Request(url, { method: 'POST', body: 'x'.repeat(70_000) }))).status, 413);
});
test('geocode validates options and handles coordinates without external requests', async () => {
  assert.equal((await geocode(new Request(url + '?q=Seattle&limit=NaN'))).status, 400);
  const response = await geocode(new Request(url + '?q=47.6,-122.3'));
  assert.equal(response.status, 200);
  assert.equal((await response.json())[0].lat, '47.6');
});
test('rate limits return an uncached 429 with retry information', () => {
  const options = { key: 'test-limit', limit: 1, windowMs: 1000 };
  assert.equal(rateLimit(new Request(url), options), null);
  const response = rateLimit(new Request(url), options)!;
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('retry-after'), '1');
});
