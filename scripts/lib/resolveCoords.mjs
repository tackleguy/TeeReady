/**
 * Disambiguate catalog entries that share coordinates but are not club siblings.
 * Uses Photon forward geocoding with a persistent cache.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_PATH = resolve('scripts/.cache/golf-coords-cache.json');
const UA = 'TeeReady/1.0 (golf catalog build)';

const NOISE = new Set([
  'golf', 'course', 'courses', 'club', 'cc', 'the', 'and', 'at', 'of', 'links',
  'country', 'municipal', 'muni', 'public', 'park', 'recreation', 'resort',
]);

const LAYOUT = new Set([
  'north', 'south', 'east', 'west', 'ocean', 'valley', 'mountain', 'lake',
  'river', 'canyon', 'upper', 'lower', 'old', 'new', 'inner', 'outer',
  'black', 'red', 'blue', 'gold', 'white', 'green', 'yellow', 'championship',
]);

function tokens(name) {
  return String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function clubStem(name) {
  return tokens(name)
    .filter((t) => !NOISE.has(t) && !LAYOUT.has(t))
    .join(' ');
}

function facilityStem(name) {
  const match = String(name).match(/\bat\s+(.+)$/i);
  if (!match?.[1]) return null;
  return clubStem(match[1]) || null;
}

function stemsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const shared = ta.filter((t) => tb.includes(t) && t.length >= 4);
  return (
    shared.length >= 2 ||
    (shared.length >= 1 && Math.min(ta.length, tb.length) === 1)
  );
}

function sharedPrefixTokens(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  let n = 0;
  for (let i = 0; i < Math.min(ta.length, tb.length); i += 1) {
    if (ta[i] !== tb[i]) break;
    n += 1;
  }
  return n;
}

function isUsCoord(lat, lon) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= 18 &&
    lat <= 72 &&
    lon >= -180 &&
    lon <= -60
  );
}

function isClubSibling(a, b) {
  if (sharedPrefixTokens(a, b) >= 3) return true;
  const facilityA = facilityStem(a);
  const facilityB = facilityStem(b);
  if (facilityA && facilityB && stemsMatch(facilityA, facilityB)) return true;
  return stemsMatch(clubStem(a), clubStem(b));
}

function coordKey(lat, lon, precision = 4) {
  return `${lat.toFixed(precision)},${lon.toFixed(precision)}`;
}

function groupIsSiblingCluster(entries) {
  const names = entries.map((entry) => entry.n);
  for (let i = 1; i < names.length; i += 1) {
    if (!isClubSibling(names[0], names[i])) return false;
  }
  return true;
}

function facilityId(entries) {
  const names = entries.map((entry) => entry.n);
  for (const name of names) {
    const stem = facilityStem(name);
    if (stem) return stem.slice(0, 48);
  }
  const stem = clubStem(names[0] ?? '');
  return stem ? stem.slice(0, 48) : coordKey(entries[0].la, entries[0].lo);
}

async function loadCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8'));
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

function pause(ms) {
  return new Promise((resolvePause) => setTimeout(resolvePause, ms));
}

async function geocodeEntry(entry, bulkById, cache, skipNetwork) {
  const bulk = entry.g ? bulkById.get(entry.g) : null;
  const queries = [
    [entry.n, entry.ci, entry.st].filter(Boolean).join(', '),
    [entry.n, entry.st].filter(Boolean).join(', '),
    bulk?.address
      ? [bulk.address, entry.ci, entry.st].filter(Boolean).join(', ')
      : null,
  ].filter(Boolean);

  for (const query of queries) {
    const cacheKey = query.toLowerCase();
    if (cache[cacheKey] !== undefined) {
      const cached = cache[cacheKey];
      if (cached && isUsCoord(cached.la, cached.lo)) return cached;
      continue;
    }
    if (skipNetwork) continue;

    const result = await lookupCoords(query, entry.la, entry.lo);
    cache[cacheKey] = result;
    if (result) return result;
  }

  return null;
}

async function lookupCoords(query, biasLat, biasLon) {
  const params = new URLSearchParams({
    q: query,
    lat: String(biasLat),
    lon: String(biasLon),
    limit: '1',
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const body = await fetchJson(
      `https://photon.komoot.io/api/?${params}`,
      ac.signal,
    );
    let coords = body?.features?.[0]?.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      const nom = new URLSearchParams({
        q: query,
        format: 'json',
        limit: '1',
        countrycodes: 'us',
      });
      const nomBody = await fetchJson(
        `https://nominatim.openstreetmap.org/search?${nom}`,
        ac.signal,
      );
      const hit = nomBody?.[0];
      if (hit?.lat && hit?.lon) {
        coords = [Number(hit.lon), Number(hit.lat)];
      }
    }
    if (!coords || coords.length < 2) return null;
    const result = {
      la: Math.round(Number(coords[1]) * 1e5) / 1e5,
      lo: Math.round(Number(coords[0]) * 1e5) / 1e5,
    };
    if (!isUsCoord(result.la, result.lo)) return null;
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    await pause(110);
  }
}

export async function disambiguateSharedCoords(catalog, bulkById = new Map(), opts = {}) {
  const skipNetwork = opts.skipNetwork === true;
  const cache = await loadCache();
  let siblingClusters = 0;
  let geocoded = 0;
  let unresolved = 0;

  for (let pass = 0; pass < 3; pass += 1) {
    const byCoord = new Map();
    for (const entry of catalog) {
      const key = coordKey(entry.la, entry.lo, 4);
      const list = byCoord.get(key) ?? [];
      list.push(entry);
      byCoord.set(key, list);
    }

    for (const entries of byCoord.values()) {
      if (entries.length < 2) continue;

      if (groupIsSiblingCluster(entries)) {
        const fac = facilityId(entries);
        for (const entry of entries) {
          entry.fac = fac;
        }
        siblingClusters += 1;
        continue;
      }

      if (pass === 0) {
        for (const entry of entries) {
          const next = await geocodeEntry(entry, bulkById, cache, skipNetwork);
          if (
            next &&
            coordKey(next.la, next.lo, 4) !== coordKey(entry.la, entry.lo, 4)
          ) {
            entry.la = next.la;
            entry.lo = next.lo;
            geocoded += 1;
          } else {
            unresolved += 1;
          }
        }
        continue;
      }

      if (pass === 2) {
        entries.forEach((entry, index) => {
          if (index === 0) return;
          entry.la = Math.round((entry.la + index * 0.00021) * 1e5) / 1e5;
          entry.lo = Math.round((entry.lo + index * 0.00017) * 1e5) / 1e5;
        });
      }
    }
  }

  if (!skipNetwork) {
    await saveCache(cache);
  }

  return { siblingClusters, geocoded, unresolved };
}

export { groupIsSiblingCluster, coordKey, isClubSibling };
