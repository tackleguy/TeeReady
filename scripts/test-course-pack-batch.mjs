/** Open every new course in the real Prep route with unavailable live APIs. */
import { chromium, devices } from 'playwright';
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { cp, readFile, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const batch = JSON.parse(await readFile(process.env.COURSE_BATCH || 'data/course-expansion/osm-2026-10.json', 'utf8'));
const outDir = 'work/course-pack-fixture';
await build({ configFile: false, publicDir: false, plugins: [react()], logLevel: 'error', build: { outDir, rollupOptions: { input: 'tests/browser/course-packs.html' } } });
await cp('public/fonts', `${outDir}/fonts`, { recursive: true });
await symlink(resolve('public/golf'), `${outDir}/golf`, 'dir');
const server = await preview({ configFile: false, build: { outDir }, preview: { host: '127.0.0.1', port: 4179, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  for (const entry of batch.courses) {
    const pack = JSON.parse(await readFile(`public/golf/holes/${entry.slug}.json`, 'utf8'));
    const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
    const page = await context.newPage(), errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.route(/^https:\/\//, route => route.abort());
    await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'offline course pack test' } }));
    const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
    await page.route(/arcgisonline\.com\/.*\/tile\//, route => route.fulfill({ contentType: 'image/png', body: tile }));
    await page.route('https://demotiles.maplibre.org/font/**', route => route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }));
    await page.goto('http://127.0.0.1:4179/tests/browser/course-packs.html');
    await page.getByRole('searchbox', { name: 'Search playable courses', exact: true }).fill(pack.name);
    const button = page.locator('li button').filter({ has: page.getByText(pack.name, { exact: true }) });
    await button.waitFor();
    assert.equal(requests.some(url => /\/golf\/(holes|greens)\/(?!manifest\.json)[^/]+\.json/.test(url)), false, 'browsing must not preload packs');
    await button.click();
    await page.getByRole('button', { name: 'Plan hole 1', exact: true }).click();
    await page.getByRole('heading', { name: pack.name, exact: true, level: 1 }).waitFor();
    const hole = page.getByRole('combobox', { name: 'Prep hole', exact: true });
    await hole.waitFor();
    assert.deepEqual(await hole.locator('option').evaluateAll(options => options.map(o => o.value).filter(Boolean)), pack.holes.map(h => String(h.number)));
    await page.waitForFunction(() => window.testMaps.at(-1)?.queryRenderedFeatures().some(f => f.source === 'golf-mapped-surfaces'));
    assert.ok(requests.some(url => url.endsWith(`/golf/holes/${entry.slug}.json`)), 'requested the selected local pack');
    const rendered = await page.evaluate(() => window.testMaps.at(-1).getSource('golf-mapped-surfaces').serialize().data.features.map(f => f.properties.osmWayId));
    assert.ok(rendered.includes(pack.holes[0].mappedSurfaces.green.osmWayId), 'renders the source green boundary');
    await hole.selectOption(String(pack.count));
    assert.equal(await hole.inputValue(), String(pack.count));
    assert.deepEqual(requests.filter(url => /\/golf\/greens\/(?!manifest\.json)[^/]+\.json/.test(url)), [], `${pack.name}: no unsupported 3D meshes`);
    assert.deepEqual(errors, [], pack.name);
    if (entry.slug === batch.courses[0].slug) await page.screenshot({ path: 'work/course-expansion/new-course-mobile.png' });
    console.log(`✓ ${pack.name}: search, ${pack.count} local holes, mapped polygons, last-hole selection; APIs unavailable`);
    await context.close();
  }
  console.log(`PASS: ${batch.courses.length} course packs opened on mobile.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
