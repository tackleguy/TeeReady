/**
 * Country / province / US-state lookup from coordinates.
 * US: census state polygons. CA/MX: admin bounding boxes + Photon cache fallback.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stateAtPoint, isInUnitedStates } from './usStateLookup.mjs';

const CACHE_PATH = resolve('scripts/data/region-reverse-cache.json');
const UA = 'TeeReady/1.0 (golf catalog build)';

/** ISO 3166-1 alpha-2 */
export const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL',
  'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT',
  'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const CA_PROVINCE_NAMES = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

const MX_STATE_NAMES = {
  BC: 'Baja California',
  BS: 'Baja California Sur',
  SO: 'Sonora',
  CH: 'Chihuahua',
  CO: 'Coahuila',
  NL: 'Nuevo León',
  TM: 'Tamaulipas',
};

/** [minLat, minLon, maxLat, maxLon, code] — checked in order for CA. */
const CA_REGION_BOXES = [
  [43.4, -66.5, 47.2, -59.5, 'NS'],
  [45.9, -69.2, 48.1, -63.8, 'NB'],
  [45.9, -64.5, 47.1, -62.4, 'PE'],
  [46.5, -67.9, 60.5, -52.5, 'NL'],
  [45.0, -79.9, 62.0, -57.0, 'QC'],
  [41.6, -95.2, 57.0, -74.3, 'ON'],
  [49.0, -102.2, 60.0, -89.4, 'MB'],
  [49.0, -110.2, 60.0, -101.3, 'SK'],
  [49.0, -120.2, 60.0, -110.0, 'AB'],
  [48.2, -139.2, 60.0, -114.0, 'BC'],
  [60.0, -141.0, 69.7, -123.8, 'YT'],
  [60.0, -136.0, 78.8, -102.0, 'NT'],
  [51.6, -120.0, 83.2, -61.0, 'NU'],
];

const MX_REGION_BOXES = [
  [32.4, -117.2, 33.1, -114.7, 'BC'],
  [22.8, -115.2, 28.5, -109.4, 'BS'],
  [26.0, -111.1, 32.6, -108.4, 'SO'],
  [25.5, -109.1, 31.9, -103.3, 'CH'],
  [24.5, -104.0, 30.0, -99.8, 'CO'],
  [23.2, -100.6, 27.8, -98.4, 'NL'],
  [22.2, -99.2, 27.4, -97.1, 'TM'],
];

function inBox(lat, lon, box) {
  const [minLa, minLo, maxLa, maxLo] = box;
  return lat >= minLa && lat <= maxLa && lon >= minLo && lon <= maxLo;
}

function canadaProvinceFromCoords(lat, lon) {
  for (const box of CA_REGION_BOXES) {
    if (inBox(lat, lon, box)) return box[4];
  }
  return null;
}

function mexicoStateFromCoords(lat, lon) {
  for (const box of MX_REGION_BOXES) {
    if (inBox(lat, lon, box)) return box[4];
  }
  return null;
}

function titleCase(value) {
  return String(value ?? '')
    .split(/\s+/)
    .map((part) =>
      part.length <= 2 && !/^\d/.test(part)
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(' ');
}

function cleanPlace(value) {
  if (!value) return null;
  const trimmed = String(value)
    .replace(/\s+Township$/i, '')
    .replace(/\s+County$/i, '')
    .trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 40) return null;
  return titleCase(trimmed);
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await mkdir(resolve('scripts/data'), { recursive: true });
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

function mapPhotonState(countryCode, stateName) {
  const cc = String(countryCode ?? '').toLowerCase();
  const state = String(stateName ?? '').trim();
  if (!state) return null;

  if (cc === 'us') {
    const upper = state.toUpperCase();
    if (US_STATES.has(upper)) return upper;
    const byName = Object.entries({
      Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA',
      Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA',
      Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS',
      Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA',
      Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT',
      Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ',
      'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
      Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
      'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT',
      Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV',
      Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC',
    }).find(([name]) => name.toLowerCase() === state.toLowerCase());
    return byName?.[1] ?? null;
  }

  if (cc === 'ca') {
    const byName = Object.entries(CA_PROVINCE_NAMES).find(
      ([, name]) => name.toLowerCase() === state.toLowerCase(),
    );
    if (byName) return byName[0];
    if (/^BC$/i.test(state) || /british columbia/i.test(state)) return 'BC';
    if (/^ON$/i.test(state) || /ontario/i.test(state)) return 'ON';
    if (/^QC$/i.test(state) || /quebec/i.test(state)) return 'QC';
  }

  if (cc === 'mx') {
    const byName = Object.entries(MX_STATE_NAMES).find(
      ([, name]) => name.toLowerCase() === state.toLowerCase(),
    );
    if (byName) return byName[0];
  }

  return null;
}

async function photonRegion(lat, lon, cache, skipNetwork) {
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (cache[key] !== undefined) return cache[key];
  if (skipNetwork) return null;

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
    const cc = String(props.countrycode ?? '').toUpperCase();
    const country = cc === 'US' ? 'US' : cc === 'CA' ? 'CA' : cc === 'MX' ? 'MX' : cc || null;
    const city =
      cleanPlace(props.city) ??
      cleanPlace(props.locality) ??
      cleanPlace(props.town) ??
      cleanPlace(props.village) ??
      cleanPlace(props.municipality) ??
      cleanPlace(props.county);
    const regionCode = mapPhotonState(props.countrycode, props.state);
    const result = { country, city, regionCode, source: 'photon' };
    cache[key] = result;
    return result;
  } catch {
    cache[key] = null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {{ co: string, st?: string, pr?: string, ci?: string }} */
export function regionFromCoords(lat, lon) {
  const usState = stateAtPoint(lat, lon);
  if (usState) {
    return { co: 'US', st: usState };
  }

  const ca = canadaProvinceFromCoords(lat, lon);
  if (ca) return { co: 'CA', pr: ca };

  const mx = mexicoStateFromCoords(lat, lon);
  if (mx) return { co: 'MX', pr: mx };

  return { co: null };
}

export function formatCatalogRegion(entry) {
  if (entry.co === 'US') {
    return [entry.ci, entry.st].filter(Boolean).join(', ') || undefined;
  }
  if (entry.co === 'CA') {
    return [entry.ci, entry.pr, 'Canada'].filter(Boolean).join(', ') || undefined;
  }
  if (entry.co === 'MX') {
    return [entry.ci, entry.pr, 'Mexico'].filter(Boolean).join(', ') || undefined;
  }
  return [entry.ci, entry.st ?? entry.pr].filter(Boolean).join(', ') || undefined;
}

export async function fixCatalogRegions(catalog, opts = {}) {
  const skipNetwork = opts.skipNetwork === true;
  const cache = await loadCache();
  let fixed = 0;
  let photon = 0;
  let us = 0;
  let ca = 0;
  let mx = 0;

  for (const entry of catalog) {
    if (!Number.isFinite(entry.la) || !Number.isFinite(entry.lo)) continue;

    let region = regionFromCoords(entry.la, entry.lo);
    if (!region.co) {
      const remote = await photonRegion(entry.la, entry.lo, cache, skipNetwork);
      if (remote?.country) {
        region = {
          co: remote.country,
          st: remote.country === 'US' ? remote.regionCode ?? undefined : undefined,
          pr: remote.country !== 'US' ? remote.regionCode ?? undefined : undefined,
          ci: remote.city ?? undefined,
        };
        photon += 1;
        await pause(100);
      }
    }

    if (!region.co) continue;

    entry.co = region.co;
    if (region.co === 'US') {
      entry.st = region.st ?? stateAtPoint(entry.la, entry.lo) ?? entry.st;
      delete entry.pr;
      us += 1;
    } else {
      delete entry.st;
      entry.pr = region.pr ?? entry.pr;
      if (region.co === 'CA') ca += 1;
      if (region.co === 'MX') mx += 1;
    }

    if (region.ci) entry.ci = region.ci;
    fixed += 1;
  }

  if (!skipNetwork) await saveCache(cache);

  return { fixed, us, ca, mx, photon };
}

function pause(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export { isInUnitedStates, stateAtPoint, CA_PROVINCE_NAMES, MX_STATE_NAMES };
