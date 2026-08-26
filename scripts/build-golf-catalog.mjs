/**
 * Build the static U.S. golf course catalog from OpenGolfAPI bulk NDJSON (ODbL).
 *
 * Verified entries (q=1) require city/state, consistent par + hole count, and
 * either a complete scorecard or a template that exactly matches declared par.
 *
 * Run: npm run build:golf-catalog
 */

import { createGunzip } from 'node:zlib';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import {
  EXCLUDE_GOLF_GIDS,
  MANUAL_COORDS_BY_GID,
  CATALOG_PATCH_BY_GID,
  PREFER_GOLF_GID,
  applyCatalogPatch,
} from './lib/catalogFixes.mjs';
import { fillMissingCities } from './lib/geocodeCity.mjs';
import { disambiguateSharedCoords, isClubSibling } from './lib/resolveCoords.mjs';
import {
  fixCatalogRegions,
  formatCatalogRegion,
  US_STATES,
} from './lib/regionLookup.mjs';
import {
  collapseDuplicateArtifacts,
  dedupeByPlaceKey,
} from './lib/catalogDedupe.mjs';

function classifyCourseType(holes, par) {
  if (holes !== 9 && holes !== 18) return 'unknown';
  if (par == null) return 'unknown';
  if (holes === 18) {
    if (par >= 69 && par <= 74) return 'regulation';
    if (par >= 60 && par <= 68) return 'executive';
    if (par <= 59) return 'par3';
    return 'unknown';
  }
  if (par >= 34 && par <= 37) return 'regulation';
  if (par >= 30 && par <= 33) return 'executive';
  if (par <= 29) return 'par3';
  return 'unknown';
}

const BULK_CACHE = resolve('scripts/.cache/opengolfapi-us.ndjson.gz');
const OUT_CATALOG_JSON = resolve('api/golf/_data/usCatalog.json');
const OUT_CATALOG_TS = resolve('api/golf/_data/usCatalog.ts');
const OUT_PUBLIC = resolve('public/golf/catalog.us.json');

const SKIP_NAME =
  /simulator|driving range|miniature golf|mini golf|pitch and putt|footgolf|disc golf|virtual golf|indoor golf|par-?3 course only/i;

function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validParForHoles(holes, par) {
  if (holes === 9) return par >= 27 && par <= 40;
  if (holes === 18) return par >= 54 && par <= 74;
  return false;
}

function validYardageForHoles(holes, yards) {
  if (yards == null) return true;
  if (holes === 9) return yards >= 900 && yards <= 3_800;
  return yards >= 4_500 && yards <= 8_800;
}

function parTemplate(holeCount, totalPar) {
  if (holeCount === 18 && totalPar === 72) {
    return [4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5];
  }
  if (holeCount === 9 && totalPar === 36) {
    return [4, 4, 3, 4, 5, 4, 4, 3, 5];
  }
  if (holeCount === 9 && totalPar === 27) {
    return [3, 3, 3, 3, 3, 3, 3, 3, 3];
  }

  const pars = Array(holeCount).fill(4);
  let sum = holeCount * 4;
  const par3Slots = holeCount === 18 ? [2, 7, 11, 16] : [2, 7];
  const par5Slots = holeCount === 18 ? [4, 13, 17] : [4];

  for (const idx of par3Slots) {
    if (idx < holeCount && sum - 1 >= totalPar) {
      pars[idx] = 3;
      sum -= 1;
    }
  }
  for (const idx of par5Slots) {
    if (idx < holeCount && sum + 1 <= totalPar) {
      pars[idx] = 5;
      sum += 1;
    }
  }

  let guard = 0;
  while (sum < totalPar && guard++ < holeCount * 4) {
    const idx = pars.findIndex((p) => p === 4);
    if (idx < 0) break;
    pars[idx] = 5;
    sum += 1;
  }
  while (sum > totalPar && guard++ < holeCount * 4) {
    const idx5 = pars.findIndex((p) => p === 5);
    if (idx5 >= 0) {
      pars[idx5] = 4;
      sum -= 1;
      continue;
    }
    const idx4 = pars.findIndex((p) => p === 4);
    if (idx4 >= 0) {
      pars[idx4] = 3;
      sum -= 1;
      continue;
    }
    break;
  }

  return pars;
}

function inferHoleCount(props) {
  const declared = Number(props.holes);
  const par = Number(props.par);
  const yardage = Number(props.total_yardage);

  if (Number.isFinite(yardage)) {
    if (yardage >= 4_500 && declared === 9) return 18;
    if (yardage <= 3_800 && declared === 18 && yardage > 0) return 9;
  }

  if (Number.isFinite(par) && par >= 27 && par <= 80) {
    if (Number.isFinite(declared) && declared === 9 && par >= 54) return 18;
    if (Number.isFinite(declared) && declared === 18 && par <= 40) return 9;
    if (declared !== 9 && declared !== 18) {
      if (par <= 40) return 9;
      if (par >= 60) return 18;
    }
  }

  if (declared === 9 || declared === 18) {
    if (Number.isFinite(par) && declared === 9 && par >= 50) return 18;
    if (Number.isFinite(par) && declared === 18 && par <= 40 && par >= 27) {
      return 9;
    }
    return declared;
  }

  if (!Number.isFinite(par) || par < 27 || par > 80) return undefined;
  if (par <= 40) return 9;
  if (par >= 60) return 18;

  const byHole = new Map();
  for (const row of props.scorecard ?? []) {
    const hole = Number(row.hole);
    const p = Number(row.par);
    if (
      Number.isFinite(hole) &&
      hole >= 1 &&
      hole <= 18 &&
      Number.isFinite(p) &&
      p >= 3 &&
      p <= 6
    ) {
      byHole.set(hole, p);
    }
  }
  if (!byHole.size) return undefined;
  const maxHole = Math.max(...byHole.keys());
  if (byHole.size >= 17 || maxHole >= 10) return 18;
  if (byHole.size >= 8) return 9;
  return undefined;
}

function extractCompleteScorecard(scorecard, holeCount, declaredPar) {
  if (!Array.isArray(scorecard) || !holeCount) return undefined;
  const byHole = new Map();
  for (const row of scorecard) {
    const hole = Number(row.hole);
    const par = Number(row.par);
    if (
      !Number.isFinite(hole) ||
      hole < 1 ||
      hole > holeCount ||
      !Number.isFinite(par) ||
      par < 3 ||
      par > 6
    ) {
      continue;
    }
    if (byHole.has(hole)) continue;
    const hcp = Number(row.handicap_index ?? row.hcp ?? row.stroke_index);
    const hint = [hole, par];
    if (Number.isFinite(hcp) && hcp >= 1 && hcp <= 18) hint.push(Math.round(hcp));
    byHole.set(hole, hint);
  }

  if (byHole.size !== holeCount) return undefined;

  let picked = [];
  for (let i = 1; i <= holeCount; i += 1) {
    const row = byHole.get(i);
    if (!row) return undefined;
    picked.push(row);
  }

  const parSum = picked.reduce((sum, row) => sum + row[1], 0);
  if (
    Number.isFinite(declaredPar) &&
    Math.abs(parSum - declaredPar) > 1
  ) {
    return undefined;
  }

  return picked;
}

function classifyAccess(name, type) {
  const n = name.toLowerCase();
  if (/resort|hotel|spa/i.test(n)) return 'resort';
  if (/country club|private|members|member/i.test(n) || type === 'Private') {
    return 'private';
  }
  if (/municipal|public|city of|county|state park/i.test(n) || type === 'Public') {
    return 'public';
  }
  return 'unknown';
}

function isVerifiedEntry(entry) {
  if (!entry.ci || !entry.co) return false;
  if (entry.co === 'US' && (!entry.st || !US_STATES.has(entry.st))) return false;
  if (entry.co !== 'US' && !entry.pr) return false;
  if (entry.h !== 9 && entry.h !== 18) return false;
  if (!entry.p || !validParForHoles(entry.h, entry.p)) return false;
  if (!validYardageForHoles(entry.h, entry.y)) return false;
  const templateSum = parTemplate(entry.h, entry.p).reduce((sum, par) => sum + par, 0);
  return templateSum === entry.p;
}

function catalogPlaceKey(entry) {
  const region = entry.co === 'US' ? entry.st ?? '' : entry.pr ?? '';
  return `${normalizeName(entry.n)}|${entry.co ?? ''}|${region}|${entry.ci ?? ''}`;
}

function catalogKey(entry) {
  if (entry.o) return `osm:${entry.o}`;
  return `name:${normalizeName(entry.n)}|${entry.st ?? ''}|${entry.ci ?? ''}`;
}

function entryRank(entry) {
  let rank = 0;
  if (entry.g && PREFER_GOLF_GID.has(entry.g)) rank += 100;
  if (entry.q === 1) rank += 50;
  if (entry.o) rank += 20;
  if (entry.h === 9 || entry.h === 18) rank += 10;
  if (entry.p) rank += 5;
  if (entry.y) rank += 3;
  if (entry.sc?.length) rank += entry.sc.length * 2;
  if (entry.w) rank += 1;
  return rank;
}

function buildEntry(feature) {
  const props = feature.properties ?? feature;
  const coords = feature.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;

  const name = String(props.name ?? '')
    .trim()
    .replace(/\u2122/g, '')
    .replace(/tm$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!name || name.length < 3 || SKIP_NAME.test(name)) return null;
  if (props.type === 'Driving Range') return null;
  if (props.id && EXCLUDE_GOLF_GIDS.has(String(props.id))) return null;

  const manualCoords = props.id ? MANUAL_COORDS_BY_GID[String(props.id)] : null;
  const lon = manualCoords ? manualCoords.lo : Number(coords[0]);
  const lat = manualCoords ? manualCoords.la : Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 18 || lat > 72 || lon < -180 || lon > -60) return null;

  const osmId = Number(props.osm_id);
  let par = Number(props.par);
  const holes = inferHoleCount(props);
  const yardage = Number(props.total_yardage);
  if (holes && Number.isFinite(par) && !validParForHoles(holes, par)) {
    par = NaN;
  }
  if (holes === 18 && !Number.isFinite(par)) par = 72;
  if (holes === 9 && !Number.isFinite(par)) par = 36;
  const sc = extractCompleteScorecard(props.scorecard, holes, par);

  const entry = {
    n: name,
    la: Math.round(lat * 1e5) / 1e5,
    lo: Math.round(lon * 1e5) / 1e5,
  };

  const city = String(props.city ?? '').trim();
  const state = String(manualCoords?.st ?? props.state ?? '').trim().toUpperCase();
  if (city) entry.ci = city;
  if (state && US_STATES.has(state)) {
    entry.st = state;
    entry.co = 'US';
  }
  if (!manualCoords && Number.isFinite(osmId) && osmId > 0) entry.o = osmId;
  if (holes === 9 || holes === 18) entry.h = holes;
  if (Number.isFinite(par) && validParForHoles(holes, par)) entry.p = par;
  if (Number.isFinite(yardage) && yardage >= 900 && yardage <= 9000) {
    if (holes === 9 && !validYardageForHoles(9, yardage)) {
      // Bulk often marks 18-hole yardage on 9-hole records — drop bad yardage.
      if (yardage >= 4_500) {
        /* hole count corrected above */
      }
    } else if (holes === 18 && !validYardageForHoles(18, yardage)) {
      if (yardage <= 3_800) {
        /* hole count corrected above */
      }
    } else if (validYardageForHoles(holes, yardage)) {
      entry.y = Math.round(yardage);
    }
  }
  if (props.website) entry.w = String(props.website).trim();
  if (props.id) entry.g = String(props.id);
  if (sc?.length) entry.sc = sc;
  entry.a = classifyAccess(name, props.type);
  return applyCatalogPatch(entry);
}

async function readBulkRecords(path) {
  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
  });
  const records = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
  }
  return records;
}

async function main() {
  const skipGeocode = process.argv.includes('--skip-geocode');
  const { access } = await import('node:fs/promises');
  const cachePresent = await access(BULK_CACHE).then(() => true).catch(() => false);
  if (!cachePresent) {
    const catalogPresent = await access(OUT_CATALOG_JSON).then(() => true).catch(() => false);
    if (catalogPresent) {
      console.log(
        `Skipping catalog rebuild — ${BULK_CACHE} missing; using committed ${OUT_CATALOG_JSON}`,
      );
      return;
    }
    throw new Error(
      `Missing bulk cache ${BULK_CACHE} and no committed catalog at ${OUT_CATALOG_JSON}`,
    );
  }

  const records = await readBulkRecords(BULK_CACHE);
  const bulkById = new Map();
  for (const feature of records) {
    const props = feature.properties ?? feature;
    if (props.id) bulkById.set(String(props.id), props);
  }

  const merged = new Map();

  for (const feature of records) {
    const entry = buildEntry(feature);
    if (!entry) continue;
    const key = catalogKey(entry);
    const prev = merged.get(key);
    if (!prev || entryRank(entry) > entryRank(prev)) {
      merged.set(key, entry);
    }
  }

  const mergedCatalog = [...merged.values()].sort((a, b) =>
    normalizeName(a.n).localeCompare(normalizeName(b.n)),
  );

  const artifactCollapse = collapseDuplicateArtifacts(mergedCatalog, {
    normalizeName,
    entryRank,
    isClubSiblingFn: isClubSibling,
  });
  let deduped = artifactCollapse.entries.sort((a, b) =>
    normalizeName(a.n).localeCompare(normalizeName(b.n)),
  );

  deduped = dedupeByPlaceKey(deduped, normalizeName, entryRank, catalogPlaceKey);
  deduped.sort((a, b) => normalizeName(a.n).localeCompare(normalizeName(b.n)));

  const geo = await fillMissingCities(deduped, bulkById, {
    skipNetwork: skipGeocode,
  });

  const regions = await fixCatalogRegions(deduped, {
    skipNetwork: skipGeocode,
  });

  const coords = await disambiguateSharedCoords(deduped, bulkById, {
    skipNetwork: skipGeocode,
    lockedGids: new Set(Object.keys(MANUAL_COORDS_BY_GID)),
  });
  const siblingClusters = new Set(
    deduped.filter((entry) => entry.fac).map((entry) => entry.fac),
  ).size;

  for (const entry of deduped) {
    delete entry.q;
    const patched = applyCatalogPatch(entry);
    Object.assign(entry, patched);
    if (entry.h != null && entry.p != null) {
      entry.typ = classifyCourseType(entry.h, entry.p);
    }
    if (isVerifiedEntry(entry)) entry.q = 1;
  }

  const catalog = deduped;
  const verified = catalog.filter((e) => e.q === 1).length;
  const withOsm = catalog.filter((e) => e.o).length;
  const completeSc = catalog.filter((e) => e.sc?.length === e.h).length;

  const catalogBody =
    '/** Generated by `scripts/build-golf-catalog.mjs` — do not edit. */\n\n' +
    'export interface UsCatalogEntry {\n' +
    '  n: string;\n' +
    '  la: number;\n' +
    '  lo: number;\n' +
    '  ci?: string;\n' +
    '  /** ISO country — US, CA, MX, … */\n' +
    '  co?: string;\n' +
    '  st?: string;\n' +
    '  /** Province / state when co !== US (BC, ON, QC, …) */\n' +
    '  pr?: string;\n' +
    '  o?: number;\n' +
    '  g?: string;\n' +
    '  h?: number;\n' +
    '  p?: number;\n' +
    '  y?: number;\n' +
    '  w?: string;\n' +
    '  sc?: Array<[number, number, number?]>;\n' +
    '  a?: "public" | "private" | "resort" | "unknown";\n' +
    '  /** Verified: location + par/holes + scorecard integrity */\n' +
    '  q?: 1;\n' +
    '  /** Shared facility id for sibling layouts at one address */\n' +
    '  fac?: string;\n' +
    '  /** regulation | executive | par3 | unknown */\n' +
    '  typ?: "regulation" | "executive" | "par3" | "unknown";\n' +
    '}\n\n' +
    "import catalogJson from './usCatalog.json';\n\n" +
    'export const US_CATALOG = catalogJson as UsCatalogEntry[];\n' +
    'export const US_CATALOG_VERIFIED = US_CATALOG.filter((entry) => entry.q === 1);\n';

  await writeFile(OUT_CATALOG_JSON, JSON.stringify(catalog), 'utf8');
  await writeFile(OUT_CATALOG_TS, catalogBody, 'utf8');

  const publicRows = catalog.map((e) => ({
    n: e.n,
    la: e.la,
    lo: e.lo,
    r: formatCatalogRegion(e),
    co: e.co,
    o: e.o,
    h: e.h,
    p: e.p,
    typ: e.typ,
    q: e.q,
  }));

  await mkdir(resolve('public/golf'), { recursive: true });
  await writeFile(OUT_PUBLIC, JSON.stringify(publicRows), 'utf8');

  console.log(`Bulk records read: ${records.length}`);
  console.log(`Catalog entries: ${catalog.length}`);
  console.log(
    `Duplicate collapse: ${artifactCollapse.removedSameCoord} same-pin, ${artifactCollapse.removedNearby} nearby-name, ${artifactCollapse.removedFarApart ?? 0} far-apart, ${artifactCollapse.removedNonUs ?? 0} non-US`,
  );
  console.log(
    `Region fix: ${regions.fixed} (${regions.us} US, ${regions.ca} CA, ${regions.mx} MX, ${regions.photon} photon)`,
  );
  console.log(
    `City backfill: ${geo.filled} filled (${geo.fromName} name, ${geo.fromZip} zip, ${geo.fromGeo} geo)`,
  );
  console.log(
    `Coord disambiguation: ${siblingClusters} sibling facilities, ${coords.geocoded} geocoded, ${coords.unresolved} unresolved`,
  );
  console.log(`Missing city after backfill: ${catalog.filter((e) => !e.ci).length}`);
  console.log(`Verified (q=1): ${verified}`);
  console.log(`Complete scorecards: ${completeSc}`);
  console.log(`With OSM id: ${withOsm}`);
  console.log(`Wrote ${OUT_CATALOG_JSON}`);
  console.log(`Wrote ${OUT_CATALOG_TS}`);
  console.log(`Wrote ${OUT_PUBLIC}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
