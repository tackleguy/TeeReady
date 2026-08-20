/**
 * Build curated scorecards from OpenGolfAPI bulk NDJSON + validated yardage merges.
 *
 * Bulk download (ODbL): https://github.com/opengolfapi/data/releases/latest
 * Per-hole yardages can be merged from a prior API import when the live API
 * rate limit is exhausted.
 */

import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const API = 'https://api.opengolfapi.org/v1';
const BULK_URL =
  'https://github.com/opengolfapi/data/releases/latest/download/opengolfapi-us.ndjson.gz';
const CACHE_DIR = resolve('scripts/.cache');
const BULK_CACHE = resolve(CACHE_DIR, 'opengolfapi-us.ndjson.gz');
const OUT_FILE = resolve('api/golf/_data/importedScorecards.ts');
const OLD_FILE = resolve('api/golf/_data/importedScorecards.ts');
const OPEN_GOLF_API_KEY = process.env.OPEN_GOLF_API_KEY?.trim() || '';

const TEE_RANK = [
  'black',
  'blue',
  'gold',
  'white',
  'green',
  'silver',
  'red',
  'forward',
  'front',
];

function argValue(name, fallback) {
  const arg = process.argv.find((entry) => entry.startsWith(`${name}=`));
  if (!arg) return fallback;
  if (name === '--enrich-yardages') {
    const value = Number(arg.slice(name.length + 1));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }
  return arg.slice(name.length + 1);
}

function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSequentialHoles(holes) {
  return holes.every((hole, index) => hole.hole === index + 1);
}

function hasOrderedTees(hole) {
  if (hole.front != null && hole.mid != null && hole.front > hole.mid) return false;
  if (hole.mid != null && hole.back != null && hole.mid > hole.back) return false;
  if (hole.front != null && hole.back != null && hole.front > hole.back) return false;
  return true;
}

function isUsableScorecard(card) {
  if (card.holes.length !== 9 && card.holes.length !== 18) return false;
  if (!isSequentialHoles(card.holes)) return false;
  const parSum = card.holes.reduce((sum, hole) => sum + hole.par, 0);
  if (parSum !== card.totalPar) return false;
  return card.holes.every((hole) => hasOrderedTees(hole));
}

function scorecardRank(card) {
  let rank = 0;
  if (card.holes.length === 18) rank += 100;
  else if (card.holes.length === 9) rank += 40;
  const withYds = card.holes.filter(
    (h) => h.back != null || h.mid != null || h.front != null,
  ).length;
  rank += withYds * 2;
  if (card.osmIds?.length) rank += 5;
  return rank;
}

function pickHoleYardages(raw) {
  const entries = Object.entries(raw ?? {})
    .filter(
      ([key, value]) =>
        key !== 'web' &&
        Number.isFinite(Number(value)) &&
        Number(value) > 0,
    )
    .map(([key, value]) => ({
      key: key.toLowerCase(),
      yards: Math.round(Number(value)),
    }));

  if (!entries.length) return {};

  const ranked = [...entries].sort((a, b) => {
    const ai = TEE_RANK.indexOf(a.key);
    const bi = TEE_RANK.indexOf(b.key);
    const ar = ai >= 0 ? ai : 99;
    const br = bi >= 0 ? bi : 99;
    if (ar !== br) return ar - br;
    return b.yards - a.yards;
  });

  const byYards = [...new Set(ranked.map((e) => e.yards))].sort((a, b) => b - a);
  const back = byYards[0];
  const front = byYards[byYards.length - 1];
  const mid = byYards[Math.floor((byYards.length - 1) / 2)] ?? back;
  return { back, mid, front };
}

function buildFromBulk(props) {
  const scorecard = props.scorecard;
  if (!Array.isArray(scorecard) || (scorecard.length !== 9 && scorecard.length !== 18)) {
    return null;
  }

  const holes = [];
  for (const row of scorecard) {
    const hole = Number(row.hole);
    const par = Number(row.par);
    if (!Number.isFinite(hole) || !Number.isFinite(par) || par < 3 || par > 6) {
      return null;
    }
    holes.push({ hole, par });
  }
  holes.sort((a, b) => a.hole - b.hole);
  if (!isSequentialHoles(holes)) return null;

  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);
  const osmId = Number(props.osm_id);
  return {
    name: String(props.name ?? '').trim(),
    totalPar,
    osmIds: Number.isFinite(osmId) && osmId > 0 ? [osmId] : undefined,
    aliases:
      props.course_name && props.course_name !== props.name
        ? [String(props.course_name)]
        : undefined,
    holes,
  };
}

function mergeHoleYardages(target, source) {
  for (const hole of target.holes) {
    const from = source.holes.find((h) => h.hole === hole.hole);
    if (!from) continue;
    if (from.back != null) hole.back = from.back;
    if (from.mid != null) hole.mid = from.mid;
    if (from.front != null) hole.front = from.front;
  }
}

function upsertCatalog(catalog, card) {
  if (!card?.name || !isUsableScorecard(card)) return false;
  const keys = new Set([normalizeName(card.name)]);
  for (const alias of card.aliases ?? []) keys.add(normalizeName(alias));
  for (const osmId of card.osmIds ?? []) keys.add(`osm:${osmId}`);

  let existingKey = null;
  for (const key of keys) {
    if (catalog.has(key)) {
      existingKey = key;
      break;
    }
  }

  if (existingKey) {
    const prev = catalog.get(existingKey);
    if (scorecardRank(card) > scorecardRank(prev.card)) {
      mergeHoleYardages(card, prev.card);
      catalog.set(existingKey, { card, keys });
      for (const key of keys) catalog.set(key, { card, keys });
      return true;
    }
    mergeHoleYardages(prev.card, card);
    return false;
  }

  const entry = { card, keys };
  for (const key of keys) catalog.set(key, entry);
  return true;
}

async function fetchJson(url, attempt = 0) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 20000);
  try {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'WeatherStop importer',
        ...(OPEN_GOLF_API_KEY
          ? { authorization: `Bearer ${OPEN_GOLF_API_KEY}` }
          : {}),
      },
      signal: ac.signal,
    });
    const body = await res.json();
    if (!res.ok) {
      if (body?.limit_hit) throw new Error('API_LIMIT');
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        return fetchJson(url, attempt + 1);
      }
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return body;
  } catch (err) {
    if (err instanceof Error && err.message === 'API_LIMIT') throw err;
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      return fetchJson(url, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureBulkCache() {
  await mkdir(CACHE_DIR, { recursive: true });
  try {
    await readFile(BULK_CACHE);
    return BULK_CACHE;
  } catch {
    // fall through
  }
  const res = await fetch(BULK_URL);
  if (!res.ok) throw new Error(`bulk download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(BULK_CACHE, buf);
  return BULK_CACHE;
}

async function readBulkRecords(path) {
  const records = [];
  const input = createReadStream(path).pipe(createGunzip());
  const rl = createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
  }
  return records;
}

async function loadPreviousImport() {
  try {
    const raw = await readFile(OLD_FILE, 'utf8');
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end < 0) return [];
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
}

async function enrichYardages(catalog, sourceIds, limit) {
  if (!limit) return 0;
  const candidates = [...new Set([...catalog.values()].map((e) => e.card))]
    .filter(
      (card) =>
        card.holes.length === 18 &&
        !card.holes.some((h) => h.back != null || h.mid != null || h.front != null),
    )
    .slice(0, limit);

  let enriched = 0;
  for (const card of candidates) {
    const id = sourceIds.get(normalizeName(card.name));
    if (!id) continue;
    try {
      const holeData = await fetchJson(`${API}/courses/${id}/holes`);
      const built = buildFromApiHoles(card, holeData.holes);
      if (!built || !isUsableScorecard(built)) continue;
      Object.assign(card, built);
      enriched += 1;
      await new Promise((r) => setTimeout(r, 350));
    } catch (err) {
      if (err instanceof Error && err.message === 'API_LIMIT') break;
    }
  }
  return enriched;
}

function buildFromApiHoles(base, holes) {
  if (!Array.isArray(holes) || holes.length < 9) return null;
  const mapped = [];
  for (const hole of holes) {
    const number = Number(hole.number);
    const par = Number(hole.par);
    if (!Number.isFinite(number) || !Number.isFinite(par)) continue;
    const entry = { hole: number, par };
    const yds = pickHoleYardages(hole.yardages);
    if (yds.back) entry.back = yds.back;
    if (yds.mid) entry.mid = yds.mid;
    if (yds.front) entry.front = yds.front;
    mapped.push(entry);
  }
  mapped.sort((a, b) => a.hole - b.hole);
  if (mapped.length !== 9 && mapped.length !== 18) return null;
  if (!isSequentialHoles(mapped)) return null;
  return {
    ...base,
    totalPar: mapped.reduce((sum, hole) => sum + hole.par, 0),
    holes: mapped,
  };
}

async function main() {
  const enrichLimit = argValue('--enrich-yardages', 0);
  if (enrichLimit > 0 && !OPEN_GOLF_API_KEY) {
    console.log(
      'No OPEN_GOLF_API_KEY found; enrichment will use anonymous quota and may stop early.',
    );
  }
  const bulkPath = await ensureBulkCache();
  const records = await readBulkRecords(bulkPath);

  const catalog = new Map();
  const sourceIds = new Map();
  let bulkBuilt = 0;
  for (const feature of records) {
    const props = feature.properties ?? feature;
    const card = buildFromBulk(props);
    if (!card) continue;
    if (props.id) sourceIds.set(normalizeName(card.name), props.id);
    if (upsertCatalog(catalog, card)) bulkBuilt += 1;
  }

  const previous = await loadPreviousImport();
  let mergedPrev = 0;
  for (const card of previous) {
    if (!isUsableScorecard(card)) continue;
    const had = catalog.size;
    upsertCatalog(catalog, card);
    if (catalog.size > had) mergedPrev += 1;
    else {
      // Merge yardages onto an existing bulk par card when names collide.
      const key = normalizeName(card.name);
      const entry = catalog.get(key) ?? catalog.get(`osm:${card.osmIds?.[0] ?? ''}`);
      if (entry) mergeHoleYardages(entry.card, card);
    }
  }

  try {
    const enriched = await enrichYardages(catalog, sourceIds, enrichLimit);
    console.log(`API yardage enrichment: ${enriched}`);
  } catch (err) {
    console.log(`API yardage enrichment skipped: ${err instanceof Error ? err.message : err}`);
  }

  const unique = new Map();
  for (const entry of catalog.values()) {
    unique.set(entry.card.name, entry.card);
  }

  const cards = [...unique.values()]
    .filter(isUsableScorecard)
    .sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));

  const body =
    "import type { CourseScorecard } from './scorecards';\n\n" +
    '// Generated by `scripts/import-opengolf-scorecards.mjs`.\n' +
    `export const IMPORTED_SCORECARDS: CourseScorecard[] = ${JSON.stringify(cards, null, 2)};\n`;
  await writeFile(OUT_FILE, body, 'utf8');

  console.log(`Bulk records: ${records.length}`);
  console.log(`Built from bulk: ${bulkBuilt}`);
  console.log(`Merged previous valid/new: ${mergedPrev}`);
  console.log(`Usable scorecards written: ${cards.length}`);
  console.log(`Output: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
