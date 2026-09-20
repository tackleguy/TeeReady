/** Exercise the actual Prep route, including slow/offline services and GPS handoff. */
import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, devices } from 'playwright';
import { cp, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const outDir = 'work/prep-fixture';
await build({ configFile: false, publicDir: false, plugins: [react()], logLevel: 'error', build: { outDir, rollupOptions: { input: 'tests/browser/prep-ui.html' } } });
await cp('public/fonts', `${outDir}/fonts`, { recursive: true });
const server = await preview({ configFile: false, build: { outDir }, preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  for (const device of [devices['iPhone 13'], { viewport: { width: 1440, height: 1000 } }]) {
    const page = await browser.newPage({ ...device, serviceWorkers: 'block' });
    const errors = [], apiCalls = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
    await page.route('**/api/**', route => { apiCalls.push(route.request().url()); return route.fulfill({ status: 503, json: { error: 'Offline test' } }); });
    await page.route('http://127.0.0.1:4178/golf/**', async route => {
      const path = new URL(route.request().url()).pathname;
      try { await route.fulfill({ contentType: 'application/json', body: await readFile(`public${path}`) }); }
      catch { await route.fulfill({ status: 404, json: {} }); }
    });
    if (!process.env.PREP_LIVE_IMAGES) {
      await page.route(/^https:\/\//, route => route.abort());
      const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
      await page.route(/arcgisonline\.com\/.*\/tile\//, route => route.fulfill({ contentType: 'image/png', body: tile }));
      await page.route('https://demotiles.maplibre.org/font/**', route => route.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }));
    }
    await page.goto('http://127.0.0.1:4178/tests/browser/prep-ui.html');
    await page.getByRole('heading', { name: 'Prepare your round' }).waitFor();
    await page.getByRole('searchbox', { name: 'Search playable courses', exact: true }).fill('Augusta National');
    await page.locator('li button').filter({ hasText: 'Augusta National Golf Club' }).first().click();
    await page.getByRole('button', { name: 'Plan hole 1', exact: true }).click();
    const hole = page.getByRole('combobox', { name: 'Prep hole', exact: true });
    assert.equal(await hole.inputValue(), '1');
    await page.locator('.prep-target').waitFor();
    assert.equal(apiCalls.some(url => url.includes('/api/caddy')), false, 'caddie requests require opening Caddie');
    const map = await page.locator('.prep-map').boundingBox();
    const panel = await page.getByRole('region', { name: 'Round preparation', exact: true }).boundingBox();
    assert.ok(map && panel && map.height >= 180, 'map remains usable alongside the panel');
    assert.ok(map.x + map.width <= panel.x + 1 || map.y + map.height <= panel.y + 1, 'planning panel must not cover map');
    const canvas = await page.locator('canvas.maplibregl-canvas').boundingBox();
    assert.ok(canvas && canvas.height >= 180, 'map canvas remains visible');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'no horizontal page overflow');
    await page.getByRole('button', { name: 'Next hole', exact: true }).click();
    assert.equal(await hole.inputValue(), '2');
    await page.getByRole('button', { name: 'Previous hole', exact: true }).click();
    await page.getByRole('combobox', { name: 'Shot', exact: true }).selectOption('approach');
    await page.getByText('Approach plan', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Shot', exact: true }).selectOption('tee');
    await page.getByRole('button', { name: 'Reset landing', exact: true }).click();
    const original = await page.locator('.prep-target').innerText();
    await page.locator('canvas.maplibregl-canvas').click({ position: { x: Math.floor(map.width * .6), y: Math.floor(map.height * .45) } });
    await page.getByRole('button', { name: 'Reset landing', exact: true }).click();
    await page.waitForFunction(text => document.querySelector('.prep-target')?.innerText === text, original);
    if (device.viewport.width < 900) {
      await page.getByRole('button', { name: 'Expand planning panel' }).click();
      await page.getByRole('button', { name: 'Collapse planning panel' }).click();
    }
    if (process.env.PREP_LIVE_IMAGES) await page.waitForTimeout(2000);
    await page.screenshot({ path: `work/prep-after-${device.viewport.width}.png` });
    await page.getByRole('button', { name: 'Conditions', exact: true }).click();
    await page.getByRole('heading', { name: 'Playing conditions' }).waitFor();
    await page.getByRole('slider', { name: 'Forecast hour' }).fill('3');
    await page.getByRole('button', { name: 'Caddie', exact: true }).click();
    await page.getByRole('region', { name: 'Caddie details', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByText('Round tools & settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Yardage book', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Change course', exact: true }).click();
    await page.getByRole('button', { name: 'Back to plan', exact: true }).click();
    assert.equal(await hole.inputValue(), '1', 'course picker preserves current plan');
    await page.getByRole('button', { name: 'Open GPS', exact: true }).click();
    await page.waitForURL('**/rounds/gps');
    await page.locator('.prep-panel').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Leave GPS and return to Prep', exact: true }).click();
    await page.waitForURL('**/rounds/prep');
    assert.equal(await hole.inputValue(), '1', 'GPS handoff retains selected hole');
    assert.deepEqual(errors, []);
    console.log(`✓ ${device.viewport.width}px Prep: course selection, clear map, hole navigation, shot mode, target reset, conditions, caddie, picker return, GPS handoff`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
