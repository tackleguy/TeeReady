import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.SMOKE_BASE || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader'] });
try {
  for (const viewport of [{ viewport: { width: 1440, height: 900 } }, devices['iPhone 13']]) {
    const context = await browser.newContext({ ...viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    // Offline smoke is deterministic and does not consume production services.
    await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"offline smoke"}' }));
    for (const route of ['/', '/today', '/courses', '/stats', '/settings', '/profile', '/group', '/swing', '/range']) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (document.querySelector('#root')?.textContent?.trim().length ?? 0) > 30);
      assert.equal(await page.locator('body').innerText().then(text => /Unexpected Application Error/.test(text)), false, route);
      console.log(`✓ ${viewport.viewport.width}px ${route}`);
    }
    assert.deepEqual(errors, [], 'uncaught browser exceptions');
    await context.close();
  }
} finally { await browser.close(); }
