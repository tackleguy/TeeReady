/** Tests actual Courses and picker components, including offline repeat visits. */
import { chromium, devices } from 'playwright';
import { build, preview } from 'vite';
import { cp, mkdir } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import assert from 'node:assert/strict';
const outDir = 'work/course-list-fixture';
await mkdir('work', { recursive: true });
await build({ configFile: false, publicDir: false, plugins: [react()], logLevel: 'error', build: { outDir, rollupOptions: { input: 'tests/browser/courses-speed.html' } } });
await cp('public/fonts', `${outDir}/fonts`, { recursive: true });
const server = await preview({ configFile: false, build: { outDir }, preview: { host: '127.0.0.1', port: 4175, strictPort: true } });
let browser;
try {
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  for (const device of [devices['iPhone 13'], { viewport: { width: 1440, height: 900 } }]) {
    const context = await browser.newContext({ ...device, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], dataRequests = [];
    page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
    await page.route(/^https:\/\//, route => route.abort());
    await page.route('http://127.0.0.1:4175/api/**', route => { if (route.request().resourceType() === 'script') return route.continue(); dataRequests.push(route.request().url()); return route.abort(); });
    await page.route('http://127.0.0.1:4175/golf/**', route => { if (route.request().resourceType() === 'script') return route.continue(); dataRequests.push(route.request().url()); return route.abort(); });
    await page.goto('http://127.0.0.1:4175/tests/browser/courses-speed.html');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.getByRole('button', { name: 'Open courses', exact: true }).click();
    await page.locator('article').first().waitFor({timeout:10000});
    assert.equal(await page.locator('article').count(),24);
    const coldMs = await page.evaluate(() => performance.now()-performance.getEntriesByName('courses-click').at(-1).startTime);
    await page.screenshot({ path: `work/courses-${device.viewport.width}.png` });
    const first = await page.locator('article h2').first().textContent();
    await page.getByRole('button',{name:'Next',exact:true}).click();
    assert.notEqual(await page.locator('article h2').first().textContent(), first);
    assert.equal(await page.locator('article').count(),24);
    await page.getByRole('searchbox',{name:'Search courses',exact:true}).fill('Augusta National');
    await page.locator('article h2').filter({hasText:'Augusta National'}).first().waitFor();
    await page.getByRole('searchbox',{name:'Search courses',exact:true}).fill('zzzz-not-a-course');
    await page.getByText('No backed-up courses match',{exact:true}).waitFor();
    await page.getByRole('searchbox',{name:'Search courses',exact:true}).fill('');
    assert.equal(await page.locator('article h2').first().textContent(), first, 'clearing search returns to page one');
    await page.getByRole('button',{name:'3D',exact:false}).first().click();
    assert.ok(await page.locator('article').count() <= 24);
    assert.ok(await page.locator('aside li').count() <= 24);
    await page.getByRole('button',{name:'Home',exact:true}).click();
    // Warm navigation must not wait for either the API or an uncached manifest.
    await page.getByRole('button',{name:'Open courses',exact:true}).click();
    await page.locator('article').first().waitFor();
    const repeatMs = await page.evaluate(() => performance.now()-performance.getEntriesByName('courses-click').at(-1).startTime);
    assert.ok(repeatMs < 750, `warm Courses exceeded 750ms at 4x CPU slowdown: ${repeatMs}`);
    await page.getByRole('button',{name:'Open course picker',exact:true}).click();
    await page.getByRole('searchbox',{name:'Search golf courses',exact:true}).focus();
    await page.locator('li').first().waitFor();
    assert.equal(await page.locator('li').count(),48);
    await page.getByRole('searchbox',{name:'Search golf courses',exact:true}).fill('Pebble Beach');
    await page.locator('li').filter({hasText:'Pebble Beach'}).first().waitFor();
    await page.locator('li button').filter({hasText:'Pebble Beach'}).first().click();
    assert.ok((await page.getByRole('searchbox',{name:'Search golf courses',exact:true}).inputValue()).includes('Pebble Beach'));
    await page.getByRole('button',{name:'Open multi picker',exact:true}).click();
    const multiSearch = page.getByRole('searchbox',{name:'Search playable golf courses',exact:true});
    await multiSearch.focus();
    assert.equal(await page.locator('li').count(),48);
    await multiSearch.fill('Augusta National');
    await page.locator('li button').filter({hasText:'Augusta National'}).first().click();
    await page.getByRole('button',{name:/Remove Augusta National/}).waitFor();
    // Once code is cached, entire list interactions continue fully offline.
    await context.setOffline(true);
    await page.getByRole('button',{name:'Home',exact:true}).click();
    await page.getByRole('button',{name:'Open courses',exact:true}).click();
    await page.locator('article').first().waitFor();
    await page.getByRole('searchbox',{name:'Search courses',exact:true}).fill('Torrey Pines');
    await page.locator('article h2').filter({hasText:'Torrey Pines'}).first().waitFor();
    assert.deepEqual(dataRequests, [], 'lists must not request APIs, manifests, or geometry');
    assert.deepEqual(errors, []);
    console.log(`✓ ${device.viewport.width}px, 4x CPU: first Courses ${Math.round(coldMs)}ms, warm ${Math.round(repeatMs)}ms; pagination, 3D filter, picker, search, offline all pass; zero data API/pack requests`);
    await context.close();
  }
} finally { await browser?.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
