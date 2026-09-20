/** Production CSS, worker, real hole lines, and locator markers must render together. */
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, webkit, devices } from 'playwright';
import { cp, mkdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const outDir = 'work/map-loading-fixture';
await mkdir('work', { recursive: true });
await build({ configFile: false, publicDir: false, plugins: [react()], logLevel: 'error', build: { outDir, rollupOptions: { input: 'tests/browser/map-loading.html' } } });
await cp('public/fonts', `${outDir}/fonts`, { recursive: true });
const headers = JSON.parse(await readFile('vercel.json', 'utf8')).headers[0].headers;
const server = await preview({ configFile: false, build: { outDir }, preview: { host: '127.0.0.1', port: 4177, strictPort: true, headers: Object.fromEntries(headers.map(h => [h.key, h.value])) } });
let browser;
try {
  browser = process.env.PLAYWRIGHT_BROWSER === 'webkit'
    ? await webkit.launch()
    : await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  for (const device of [devices['iPhone 13'], { viewport: { width: 1440, height: 900 } }]) {
    const context = await browser.newContext({ ...device, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    // Keep the map engine and real course geometry; isolate external imagery.
    await page.route(/^https:\/\//, route => route.abort());
    const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
    await page.route(/arcgisonline\.com\/.*\/tile\//, route => route.fulfill({ contentType: 'image/png', body: tile }));
    await page.route('https://demotiles.maplibre.org/font/**', route => route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }));
    await page.route('https://tiles.openfreemap.org/styles/positron', route => route.fulfill({ json: {
      version: 8, glyphs: 'http://127.0.0.1:4177/glyphs/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e7ede3' } }],
    } }));
    await page.route('**/glyphs/**', route => route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }));
    await page.route('**/golf/greens/manifest.json', route => route.fulfill({ json: { courses: [] } }));
    await page.goto('http://127.0.0.1:4177/tests/browser/map-loading.html');
    for (const kind of ['golf', 'locator', 'golf']) {
      await page.locator('.maplibregl-map').waitFor({ state: 'attached' });
      const container = await page.locator('.maplibregl-map').boundingBox();
      assert.ok(container && container.height >= 490, `${kind} map collapsed: ${JSON.stringify(container)}`);
      await page.getByTestId('status').filter({ hasText: 'ready' }).waitFor();
      const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
      assert.ok(canvas && canvas.height >= 490, `${kind} canvas must fill its visible container`);
      await page.waitForFunction(source => {
        const map = window.testMaps.at(-1);
        return map.queryRenderedFeatures().some(feature => feature.source === source);
      }, kind === 'golf' ? 'golf-holes' : 'teeready-courses');
      if (kind === 'locator') await page.screenshot({ path: `work/map-loading-${device.viewport.width}.png` });
      await page.getByRole('button', { name: 'Switch map', exact: true }).click();
    }
    assert.deepEqual(errors, []);
    console.log(`✓ ${device.viewport.width}px production: visible 500px maps, real hole lines and locator markers, repeated navigation`);
    await context.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
