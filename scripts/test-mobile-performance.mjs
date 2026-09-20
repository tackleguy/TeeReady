/** Real course hook and WebGL map, with deterministic responses and no production traffic. */
import { chromium, devices } from 'playwright';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import assert from 'node:assert/strict';
const server = await createServer({ configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 4174, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  for (const device of [devices['iPhone 13'], { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }]) {
    const context = await browser.newContext({ ...device, serviceWorkers: 'block' });
    const page = await context.newPage();
    const requests = [];
    const errors = [];
    const workerUrls = [];
    page.on('worker', worker => workerUrls.push(worker.url()));
    page.on('response', response => {
      if (response.url().startsWith('http://127.0.0.1:4174/') && response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    page.on('request', req => requests.push(req.url()));
    page.on('pageerror', err => errors.push(err.message));
    await page.route('https://**', route => route.abort());
    await page.route('**/api/golf/courses?*', route => route.fulfill({ json: { courses: Array.from({ length: 6 }, (_, i) => ({ id: `way:${i}`, osmType: 'way', osmId: i, name: `Golf Course ${i}`, lat: 47.6 + i * 0.01, lon: -122.3, holes: 18, kind: 'course' })) } }));
    await page.route('**/golf/greens/manifest.json', route => route.fulfill({ json: { courses: [] } }));
    await page.goto('http://127.0.0.1:4174/tests/browser/mobile-performance.html');
    await page.getByTestId('courses').filter({ hasText: '6 courses' }).waitFor();
    await page.waitForTimeout(4500); // Exceeds the removed idle prefetch deadline.
    assert.equal(requests.some(url => /arcgisonline|\/api\/golf\/holes|\/golf\/(greens|holes|scorecards)\//.test(url)), false, 'course browsing must not download maps or packs');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Open map' }).click();
      await page.getByTestId('map-status').filter({ hasText: 'ready' }).waitFor();
      const box = await page.locator('.maplibregl-map').boundingBox();
      assert.ok(box && box.height >= 410, 'map container must remain visible without fixture CSS');
      const ratio = await page.locator('canvas.maplibregl-canvas').evaluate(canvas => canvas.width / canvas.clientWidth);
      assert.ok(ratio <= 1.51, `canvas pixel ratio was ${ratio}`);
      await page.getByRole('button', { name: 'Close map' }).click();
      assert.equal(await page.locator('canvas').count(), 0, 'map canvas removed on close');
    }
    assert.equal(requests.some(url => /\/golf\/greens\/(?!manifest\.json)[^/?]+\.json/.test(url)), false, '2D map must not fetch green meshes');
    assert.equal(requests.some(url => /node_modules.*three/.test(url)), false, '2D map must not load Three.js');
    assert.ok(workerUrls.length > 0, 'map starts a bundled worker');
    assert.ok(workerUrls.every(url => url.includes('maplibre-gl-worker')), 'map uses the explicitly bundled worker');
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Open green', exact: true }).click();
      await page.locator('[role="dialog"] canvas').waitFor();
      await page.waitForTimeout(150);
      const ratio = await page.locator('[role="dialog"] canvas').evaluate(canvas => canvas.width / canvas.clientWidth);
      assert.ok(ratio <= 1.51, '3D canvas resolution is bounded');
      await page.getByRole('button', { name: 'Close green reader' }).click();
      assert.equal(await page.locator('canvas').count(), 0, '3D canvas removed on close');
    }
    assert.deepEqual(errors, [], 'browser exceptions or missing local resources');
    console.log(`✓ ${device.viewport.width}px: no speculative course downloads; three map and green opens/closes; bounded canvases; no unrequested 3D downloads`);
    await context.close();
  }
} finally {
  await browser?.close();
  await server.close();
}
