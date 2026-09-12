/**
 * Build an international golf course catalog from OpenStreetMap (Overpass).
 *
 * Priority countries beyond the US OpenGolf dump. Writes:
 *   api/golf/_data/worldCatalog.json
 *   public/golf/catalog.world.json
 *
 * Usage:
 *   node scripts/build-world-catalog.mjs
 *   node scripts/build-world-catalog.mjs --only=CA,GB,AU
 *   node scripts/build-world-catalog.mjs --limit=200
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = join(ROOT, 'api/golf/_data/worldCatalog.json');
const OUT_PUBLIC = join(ROOT, 'public/golf/catalog.world.json');
const US_CATALOG = join(ROOT, 'api/golf/_data/usCatalog.json');

const COUNTRIES = [
  { co: 'CA', name: 'Canada' },
  { co: 'GB', name: 'United Kingdom' },
  { co: 'IE', name: 'Ireland' },
  { co: 'AU', name: 'Australia' },
  { co: 'NZ', name: 'New Zealand' },
  { co: 'JP', name: 'Japan' },
  { co: 'KR', name: 'South Korea' },
  { co: 'MX', name: 'Mexico' },
  { co: 'ES', name: 'Spain' },
  { co: 'PT', name: 'Portugal' },
  { co: 'FR', name: 'France' },
  { co: 'DE', name: 'Germany' },
  { co: 'IT', name: 'Italy' },
  { co: 'SE', name: 'Sweden' },
  { co: 'NO', name: 'Norway' },
  { co: 'DK', name: 'Denmark' },
  { co: 'NL', name: 'Netherlands' },
  { co: 'BE', name: 'Belgium' },
  { co: 'CH', name: 'Switzerland' },
  { co: 'AT', name: 'Austria' },
  { co: 'ZA', name: 'South Africa' },
];

const OVERPASS_URLS = (
  process.env.OVERPASS_URLS ??
  [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const SKIP_NAME =
  /simulator|driving range|miniature|mini.?golf|pitch.?and.?putt|footgolf|disc golf|indoor|virtual|practice range|putting green|golf academy|golf centre$|golf center$/i;

function parseArgs(argv) {
  let only = null;
  let limit = Infinity;
  for (const a of argv) {
    if (a.startsWith('--only=')) {
      only = new Set(
        a
          .slice(7)
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean),
      );
    } else if (a.startsWith('--limit=')) {
      limit = Number(a.slice(8)) || limit;
    }
  }
  return { only, limit };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function centerOf(el) {
  if (el.type === 'node' && Number.isFinite(el.lat) && Number.isFinite(el.lon)) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center && Number.isFinite(el.center.lat) && Number.isFinite(el.center.lon)) {
    return { lat: el.center.lat, lon: el.center.lon };
  }
  if (Array.isArray(el.geometry) && el.geometry.length) {
    const lat =
      el.geometry.reduce((s, p) => s + p.lat, 0) / el.geometry.length;
    const lon =
      el.geometry.reduce((s, p) => s + p.lon, 0) / el.geometry.length;
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

function parseHoles(tags) {
  const raw = tags?.holes ?? tags?.['golf:holes'];
  const n = Number(raw);
  if (n === 9 || n === 18) return n;
  return undefined;
}

function parsePar(tags) {
  const n = Number(tags?.par);
  if (Number.isFinite(n) && n >= 27 && n <= 76) return n;
  return undefined;
}

async function overpassQuery(query, { attempts = 4 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    const url = OVERPASS_URLS[i % OVERPASS_URLS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'TeeReady world-catalog/1.0',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(180_000),
      });
      if (res.status === 429 || res.status === 504 || res.status === 502) {
        lastErr = new Error(`overpass ${res.status}`);
        await sleep(1500 * (i + 1));
        continue;
      }
      if (!res.ok) {
        lastErr = new Error(`overpass ${res.status}`);
        await sleep(800 * (i + 1));
        continue;
      }
      const data = await res.json();
      return data.elements ?? [];
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(1200 * (i + 1));
    }
  }
  throw lastErr ?? new Error('overpass failed');
}

async function fetchCountryCourses(co) {
  const query = `
[out:json][timeout:180];
area["ISO3166-1"="${co}"][admin_level=2]->.a;
(
  way["leisure"="golf_course"]["name"](area.a);
  relation["leisure"="golf_course"]["name"](area.a);
);
out center tags;
`.trim();
  return overpassQuery(query);
}

function toEntry(el, co) {
  const tags = el.tags ?? {};
  const name = String(tags.name ?? '').trim();
  if (!name || SKIP_NAME.test(name)) return null;
  const c = centerOf(el);
  if (!c) return null;
  const h = parseHoles(tags);
  const p = parsePar(tags);
  const entry = {
    n: name,
    la: Math.round(c.lat * 1e5) / 1e5,
    lo: Math.round(c.lon * 1e5) / 1e5,
    co,
    o: el.id,
    a: 'unknown',
    typ: 'unknown',
    q: 0,
  };
  if (h) entry.h = h;
  if (p) entry.p = p;
  if (tags['addr:city']) entry.ci = String(tags['addr:city']);
  if (tags['addr:state'] || tags['addr:province']) {
    entry.pr = String(tags['addr:state'] || tags['addr:province']);
  }
  if (tags.website || tags['contact:website']) {
    entry.w = String(tags.website || tags['contact:website']);
  }
  return entry;
}

function loadExistingSlugs() {
  const slugs = new Set();
  for (const path of [US_CATALOG, OUT_JSON]) {
    if (!existsSync(path)) continue;
    try {
      const rows = JSON.parse(readFileSync(path, 'utf8'));
      for (const r of rows) {
        const s = slugify(r.n);
        if (s) slugs.add(s);
      }
    } catch {
      /* skip */
    }
  }
  return slugs;
}

async function main() {
  const { only, limit } = parseArgs(process.argv.slice(2));
  const targets = COUNTRIES.filter((c) => !only || only.has(c.co));
  const existing = loadExistingSlugs();
  // Keep prior world rows for countries not refreshed this run.
  let prior = [];
  if (existsSync(OUT_JSON)) {
    try {
      prior = JSON.parse(readFileSync(OUT_JSON, 'utf8'));
    } catch {
      prior = [];
    }
  }
  const bySlug = new Map();
  for (const row of prior) {
    if (only && !only.has(String(row.co || '').toUpperCase())) {
      const s = slugify(row.n);
      if (s) bySlug.set(s, row);
    }
  }

  console.log(
    `World catalog: ${targets.map((t) => t.co).join(', ')} (limit=${Number.isFinite(limit) ? limit : '∞'})`,
  );

  for (const { co, name } of targets) {
    process.stdout.write(`→ ${co} ${name}… `);
    try {
      const elements = await fetchCountryCourses(co);
      let added = 0;
      for (const el of elements) {
        if (bySlug.size >= limit) break;
        const entry = toEntry(el, co);
        if (!entry) continue;
        const slug = slugify(entry.n);
        if (!slug || existing.has(slug) || bySlug.has(slug)) continue;
        // Prefer regulation-sized when holes known; still keep unknown for OSM backup.
        bySlug.set(slug, entry);
        added += 1;
      }
      console.log(`${elements.length} OSM → +${added} catalog`);
    } catch (err) {
      console.log(`failed (${err instanceof Error ? err.message : err})`);
    }
    await sleep(1200);
  }

  const catalog = [...bySlug.values()].sort((a, b) =>
    String(a.n).localeCompare(String(b.n)),
  );
  mkdirSync(dirname(OUT_JSON), { recursive: true });
  mkdirSync(dirname(OUT_PUBLIC), { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(catalog));
  writeFileSync(
    OUT_PUBLIC,
    JSON.stringify({
      version: 1,
      builtAt: new Date().toISOString(),
      count: catalog.length,
      source: 'OpenStreetMap Overpass (ODbL)',
      courses: catalog,
    }),
  );

  const byCo = {};
  for (const c of catalog) byCo[c.co] = (byCo[c.co] || 0) + 1;
  console.log(`\nWrote ${catalog.length} international courses → ${OUT_JSON}`);
  console.log(byCo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
