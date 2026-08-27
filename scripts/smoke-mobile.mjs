#!/usr/bin/env node
/**
 * Smoke-test SPA routes + key static assets (mobile deploy sanity).
 * Usage: npm run preview -- --port 4173 &  node scripts/smoke-mobile.mjs
 */
const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:4173';

const ROUTES = [
  '/',
  '/today',
  '/courses',
  '/courses/map',
  '/rounds/prep',
  '/rounds/gps',
  '/stats',
  '/swing',
  '/settings',
  '/profile',
  '/group',
  '/questionnaire',
  '/golf',
  '/rounds',
];

const ASSETS = [
  '/golf/greens/manifest.json',
  '/golf/holes/manifest.json',
  '/golf/scorecards/manifest.json',
  '/manifest.webmanifest',
  '/icon.svg',
];

async function check(path) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { redirect: 'manual' });
    const ok = res.status >= 200 && res.status < 400;
    return { path, status: res.status, ok };
  } catch (err) {
    return { path, status: 0, ok: false, err: String(err.message || err) };
  }
}

async function main() {
  console.log(`Smoke test → ${BASE}\n`);
  let fail = 0;

  for (const path of ROUTES) {
    const r = await check(path);
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} ${path} → ${r.status}${r.err ? ` (${r.err})` : ''}`);
    if (!r.ok) fail += 1;
  }

  console.log('\nStatic assets:');
  for (const path of ASSETS) {
    const r = await check(path);
    const mark = r.ok ? '✓' : '✗';
    console.log(`${mark} ${path} → ${r.status}`);
    if (!r.ok) fail += 1;
  }

  // Manifest sanity
  try {
    const res = await fetch(`${BASE}/golf/greens/manifest.json`);
    if (res.ok) {
      const m = await res.json();
      console.log(`\nGreen meshes: ${m.count ?? m.courses?.length ?? 0} courses`);
    }
  } catch {
    /* optional */
  }

  console.log(fail ? `\n${fail} check(s) failed` : '\nAll checks passed');
  process.exit(fail ? 1 : 0);
}

main();
