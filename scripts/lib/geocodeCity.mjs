/**
 * Resolve missing U.S. city names for golf catalog entries.
 * Uses name parsing, postal lookup, then Photon reverse geocoding (cached).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_PATH = resolve('scripts/.cache/golf-city-cache.json');
const UA = 'TeeReady/1.0 (golf catalog build)';

/** OpenGolf ids with missing/wrong city in bulk — hand-curated. */
export const MANUAL_CITY_BY_GID = {};

export {
  EXCLUDE_GOLF_GIDS,
  MANUAL_COORDS_BY_GID,
} from './catalogFixes.mjs';

const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};

const GENERIC_NAME_PREFIX =
  /^(the|municipal|public|private|university|memorial|championship|executive|practice)$/i;

export function cityFromName(name) {
  const cleaned = String(name ?? '')
    .replace(/\u2122/g, '')
    .replace(/tm$/i, '')
    .trim();

  const patterns = [
    /^(.+?)\s+(?:Country Club|Golf(?:\s+(?:and\s+Country\s+Club|Club|Course|Links|Resort|Links Course))?|Municipal Golf Course|Public Golf Course)\b/i,
    /^(.+?)\s+(?:Golf\s+Club|Golf\s+Course|Golf\s+Links)\b/i,
    /^(.+?)\s+(?:Conservation\s+Park|State\s+Park|Regional\s+Park)\b/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;
    let city = match[1]
      .replace(/\s+(North|South|East|West|At|No\.?\s*\d+)$/i, '')
      .trim();
    if (
      city.length >= 3 &&
      city.length <= 40 &&
      !GENERIC_NAME_PREFIX.test(city)
    ) {
      return titleCase(city);
    }
  }

  return null;
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .map((part) =>
      part.length <= 2 && !/^\d/.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

function cleanPhotonPlace(value) {
  if (!value) return null;
  const trimmed = String(value)
    .replace(/\s+Township$/i, '')
    .replace(/\s+County$/i, '')
    .trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 40) return null;
  return titleCase(trimmed);
}

function cacheKey(kind, value) {
  return `${kind}:${value}`;
}

async function loadCache() {
  try {
    const raw = await readFile(CACHE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await mkdir(resolve('scripts/.cache'), { recursive: true });
  await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

async function fetchJson(url, signal) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal,
  });
  if (!res.ok) return null;
  return res.json();
}

export async function cityFromPostal(postal, state, cache) {
  const zip = String(postal ?? '').trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) return null;
  const key = cacheKey('zip', zip);
  if (cache[key] !== undefined) return cache[key];

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const body = await fetchJson(`https://api.zippopotam.us/us/${zip}`, ac.signal);
    const places = body?.places ?? [];
    const match =
      places.find((place) => place['state abbreviation'] === state) ??
      places[0];
    const city = match?.['place name'] ? titleCase(match['place name']) : null;
    cache[key] = city;
    return city;
  } catch {
    cache[key] = null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function cityFromPhoton(lat, lon, cache) {
  const rounded = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const key = cacheKey('geo', rounded);
  if (cache[key] !== undefined) return cache[key];

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    lang: 'en',
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const body = await fetchJson(
      `https://photon.komoot.io/reverse?${params}`,
      ac.signal,
    );
    const props = body?.features?.[0]?.properties ?? {};
    const city =
      cleanPhotonPlace(props.city) ??
      cleanPhotonPlace(props.locality) ??
      cleanPhotonPlace(props.town) ??
      cleanPhotonPlace(props.village) ??
      cleanPhotonPlace(props.municipality) ??
      cleanPhotonPlace(props.county);
    cache[key] = city;
    return city;
  } catch {
    cache[key] = null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fillMissingCities(catalog, bulkById, opts = {}) {
  const skipNetwork = opts.skipNetwork === true;
  const cache = await loadCache();
  let filled = 0;
  let fromName = 0;
  let fromZip = 0;
  let fromGeo = 0;

  for (const entry of catalog) {
    if (entry.ci && entry.st) continue;

    let city = entry.ci ?? null;
    const bulk = entry.g ? bulkById.get(entry.g) : null;

    if (!city && entry.g && MANUAL_CITY_BY_GID[entry.g]) {
      city = MANUAL_CITY_BY_GID[entry.g];
    }

    if (!city) {
      city = cityFromName(entry.n);
      if (city) fromName += 1;
    }

    if (!city && !skipNetwork && bulk?.postal_code && entry.st) {
      city = await cityFromPostal(bulk.postal_code, entry.st, cache);
      if (city) fromZip += 1;
      await pause(120);
    }

    if (!city && !skipNetwork && Number.isFinite(entry.la) && Number.isFinite(entry.lo)) {
      city = await cityFromPhoton(entry.la, entry.lo, cache);
      if (city) fromGeo += 1;
      await pause(120);
    }

    if (city) {
      entry.ci = city;
      filled += 1;
    }
  }

  if (!skipNetwork) {
    await saveCache(cache);
  }

  return { filled, fromName, fromZip, fromGeo };
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { STATE_NAMES };
