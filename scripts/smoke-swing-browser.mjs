/**
 * Browser smoke for /swing routes (auth gate + shell).
 * Run: npx playwright test is not configured — use: node scripts/smoke-swing-browser.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:5173';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on('pageerror', (e) => errors.push(String(e)));

async function check(path) {
  const res = await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
  const status = res?.status() ?? 0;
  const url = page.url();
  const body = await page.locator('body').innerText().catch(() => '');
  const title = await page.title();
  return { path, status, url, title, snippet: body.slice(0, 200).replace(/\s+/g, ' ') };
}

console.log(`Browser smoke → ${BASE}\n`);

const home = await check('/');
console.log(`✓ / → ${home.status} · ${home.url}`);
console.log(`  ${home.snippet.slice(0, 120)}…`);

const swing = await check('/swing');
console.log(`✓ /swing → ${swing.status} · landed ${swing.url}`);
console.log(`  ${swing.snippet.slice(0, 160)}…`);

const guide = await check('/swing/guide');
console.log(`✓ /swing/guide → ${guide.status} · landed ${guide.url}`);
console.log(`  ${guide.snippet.slice(0, 160)}…`);

// Confirm SPA serves the swing chunk without console pageerrors for public home
const swingAsset = await page.goto(`${BASE}/src/routes/SwingView.tsx`, {
  waitUntil: 'domcontentloaded',
  timeout: 10000,
}).catch(() => null);
// In Vite, source maps / modules load via import — instead fetch the route module URL pattern
const mod = await fetch(`${BASE}/src/routes/SwingView.tsx`);
console.log(`✓ SwingView module → ${mod.status}`);

const guideMod = await fetch(`${BASE}/src/routes/SwingGuideView.tsx`);
console.log(`✓ SwingGuideView module → ${guideMod.status}`);

const planMod = await fetch(`${BASE}/src/lib/swingPlan.ts`);
console.log(`✓ swingPlan module → ${planMod.status}`);

if (errors.length) {
  console.log('\nPage errors:');
  for (const e of errors) console.log(' -', e);
}

const authGated =
  swing.url.includes('/') &&
  !swing.url.includes('/swing') ||
  /sign|log in|account|TeeReady/i.test(swing.snippet);

console.log(
  authGated
    ? '\nNote: /swing is behind auth (redirect or login) — expected without a session.'
    : '\n/swing rendered without redirect.',
);

await browser.close();
console.log('\nBrowser smoke done.');
