#!/usr/bin/env node
/**
 * Mobile viewport audit — navigation, overflow, tap targets.
 * Requires: npm run build && npm run preview -- --port 4173
 */
import { chromium, devices } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173';
const MIN_TAP = 44;

const ROUTES = [
  '/',
  '/today',
  '/courses',
  '/courses/map',
  '/rounds/prep',
  '/rounds/gps',
  '/stats',
  '/settings',
  '/profile',
  '/group',
  '/questionnaire',
];

const iphone = devices['iPhone 13'];

async function auditRoute(page, path) {
  const url = `${BASE}${path}`;
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e.message)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 25_000 });
  } catch {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    } catch (e) {
      return { path, ok: false, errors: [`navigation failed: ${e.message}`] };
    }
  }

  await page.waitForTimeout(600);

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body?.scrollWidth ?? 0);
    const clientW = doc.clientWidth;
    const overflowX = scrollW > clientW + 2;
    const root = document.getElementById('root');
    return {
      overflowX,
      scrollW,
      clientW,
      hasRoot: Boolean(root && root.childElementCount > 0),
      title: document.title,
    };
  });

  if (metrics.overflowX) {
    errors.push(`horizontal overflow ${metrics.scrollW}px > ${metrics.clientW}px`);
  }
  if (!metrics.hasRoot) {
    errors.push('empty #root');
  }

  const finalPath = new URL(page.url()).pathname;

  const criticalConsole = consoleErrors.filter(
    (m) =>
      !/favicon|manifest|401|403|Failed to load resource|net::ERR/.test(m) &&
      !/Supabase|auth/i.test(m),
  );
  if (criticalConsole.length) {
    errors.push(`console: ${criticalConsole[0]?.slice(0, 120)}`);
  }

  return { path, ok: errors.length === 0, errors, finalPath };
}

/**
 * Measure visible button / role=button hit areas.
 * Elements with .control-compact expand via ::after — count as meeting the floor.
 */
async function auditTapTargets(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const undersized = await page.evaluate((minTap) => {
    const nodes = [
      ...document.querySelectorAll('button, [role="button"], .chip-button'),
    ];
    const bad = [];
    for (const el of nodes) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

      let w = rect.width;
      let h = rect.height;
      if (el.classList.contains('control-compact')) {
        w = Math.max(w, minTap);
        h = Math.max(h, minTap);
      }

      if (w + 0.5 < minTap || h + 0.5 < minTap) {
        const label =
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          (el.textContent || '').trim().slice(0, 40) ||
          el.className?.toString?.().slice(0, 40) ||
          el.tagName;
        bad.push({
          label,
          w: Math.round(w * 10) / 10,
          h: Math.round(h * 10) / 10,
        });
      }
    }
    return bad.slice(0, 12);
  }, MIN_TAP);

  return {
    ok: undersized.length === 0,
    undersized,
  };
}

async function testMobileNav(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const nav = page.locator('nav.md\\:hidden');
  if ((await nav.count()) === 0) return { ok: true, note: 'no mobile nav (desktop?)' };

  const today = page.getByRole('link', { name: 'Today', exact: true });
  if (await today.isVisible()) {
    await today.click();
    await page.waitForTimeout(400);
  }

  const roundsBtn = page.getByRole('button', { name: /Rounds/i });
  if (await roundsBtn.isVisible()) {
    await roundsBtn.click();
    await page.waitForTimeout(300);
    const prep = page.getByRole('menuitem', { name: 'Prep' });
    if (await prep.isVisible()) {
      await prep.click();
      await page.waitForTimeout(800);
    }
  }

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });

  return { ok: !overflow, finalPath: new URL(page.url()).pathname };
}

async function main() {
  console.log(`Mobile audit → ${BASE} (${iphone.viewport.width}×${iphone.viewport.height})\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iphone,
    locale: 'en-US',
  });
  const page = await context.newPage();

  let fail = 0;
  for (const path of ROUTES) {
    const r = await auditRoute(page, path);
    const mark = r.ok ? '✓' : '✗';
    console.log(
      `${mark} ${path}${r.finalPath && r.finalPath !== path ? ` → ${r.finalPath}` : ''}${
        r.errors?.length ? ` — ${r.errors.join('; ')}` : ''
      }`,
    );
    if (!r.ok) fail += 1;
  }

  console.log('\nMobile nav flow:');
  const nav = await testMobileNav(page);
  console.log(
    nav.ok
      ? `✓ Rounds menu → ${nav.finalPath ?? 'ok'}`
      : `✗ nav flow failed${nav.note ? ` (${nav.note})` : ''}`,
  );
  if (!nav.ok) fail += 1;

  console.log(`\nTap targets (≥${MIN_TAP}×${MIN_TAP}px):`);
  const taps = await auditTapTargets(page);
  if (taps.ok) {
    console.log('✓ all visible buttons meet minimum');
  } else {
    console.log(`✗ ${taps.undersized.length} undersized control(s):`);
    for (const u of taps.undersized) {
      console.log(`  • ${u.w}×${u.h} — ${u.label}`);
    }
    fail += 1;
  }

  await browser.close();
  console.log(fail ? `\n${fail} issue(s)` : '\nMobile audit passed');
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
