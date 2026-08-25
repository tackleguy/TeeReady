import type { GolfCourseSummary } from '../courses';
import { classifyVenueKind } from './venueKind';
import { US_CATALOG, type UsCatalogEntry } from '../_data/usCatalog';

const MI_PER_KM = 0.621371;

function haversineMi(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const A =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(A));
}

function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 3 &&
        ![
          'golf',
          'course',
          'club',
          'the',
          'and',
          'park',
          'country',
          'national',
          'beach',
          'city',
          'hills',
          'valley',
          'point',
          'links',
          'municipal',
          'public',
          'private',
        ].includes(t),
    );
}

function nameMatchScore(name: string, needle: string, tokens: string[]): number {
  const n = name.toLowerCase();
  if (n === needle) return 0;
  if (n.includes(needle) && needle.length >= 4) return 1;
  if (!tokens.length) return n.includes(needle.split(/\s+/)[0] ?? '') ? 3 : 9;
  const hits = tokens.filter((t) => n.includes(t)).length;
  if (hits === tokens.length) return 2;
  if (hits >= Math.ceil(tokens.length * 0.67) && hits >= 1) return 4;
  return 9;
}

/** Match city / "City, ST" — not course names like "Augusta National". */
function placeMatchScore(
  entry: UsCatalogEntry,
  needle: string,
  tokens: string[],
): number {
  const city = (entry.ci ?? '').toLowerCase().trim();
  const state = (entry.st ?? '').toLowerCase().trim();
  if (!city) return 9;

  const needlePlace = needle.replace(/\s*,\s*/g, ', ').trim();
  const place = state ? `${city}, ${state}` : city;
  const words = needlePlace.split(/\s+/).filter(Boolean);

  if (city === needlePlace || place === needlePlace) return 0;

  if (state && needlePlace.endsWith(`, ${state}`)) {
    const cityPart = needlePlace.slice(0, -(state.length + 2)).trim();
    if (cityPart && city === cityPart) return 0;
  }

  // Multi-word queries that are not exactly the city (e.g. "Augusta National")
  // must not match every course in Augusta, GA/MO.
  if (words.length >= 2 && city !== needlePlace) {
    const cityWords = city.split(/\s+/).filter(Boolean);
    const cityPhrase = cityWords.join(' ');
    if (needlePlace === cityPhrase) return 0;
    if (
      tokens.length >= 2 &&
      tokens.every((t) => cityWords.some((cw) => cw === t || cw.startsWith(t)))
    ) {
      return 1;
    }
    return 9;
  }

  if (words.length === 1) {
    const word = words[0]!;
    if (city === word) return 0;
    if (word.length >= 4 && (city.startsWith(word) || word.startsWith(city))) {
      return 1;
    }
    if (word.length >= 4 && city.includes(word)) return 2;
  }

  if (tokens.length) {
    const cityTokens = city.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
    const hits = tokens.filter((t) =>
      cityTokens.some((ct) => ct === t || ct.startsWith(t) || t.startsWith(ct)),
    ).length;
    if (hits === tokens.length) return 1;
    if (hits >= Math.ceil(tokens.length * 0.67) && hits >= 1) return 3;
  }

  return 9;
}

function catalogMatchScore(
  entry: UsCatalogEntry,
  needle: string,
  tokens: string[],
): number {
  const nameScore = nameMatchScore(entry.n, needle, tokens);
  if (nameScore <= 3) return nameScore;
  return placeMatchScore(entry, needle, tokens);
}

function entryToSummary(
  entry: UsCatalogEntry,
  originLat: number,
  originLon: number,
): GolfCourseSummary {
  const osmId = entry.o ?? 0;
  const id =
    osmId > 0 ? `way/${osmId}` : entry.g ? `opengolf/${entry.g}` : `catalog/${entry.la},${entry.lo}`;
  const region = [entry.ci, entry.st].filter(Boolean).join(', ') || undefined;
  const name = entry.n;
  return {
    id,
    osmType: osmId > 0 ? 'way' : 'node',
    osmId,
    name,
    lat: entry.la,
    lon: entry.lo,
    holes: entry.h,
    par: entry.p,
    website: entry.w,
    region,
    access: entry.a ?? 'unknown',
    kind: classifyVenueKind(name),
    distanceMi: haversineMi(originLat, originLon, entry.la, entry.lo),
  };
}

function findCatalogEntry(summary: GolfCourseSummary): UsCatalogEntry | undefined {
  return US_CATALOG.find(
    (entry) =>
      (entry.o != null && entry.o === summary.osmId) ||
      (entry.g != null && summary.id === `opengolf/${entry.g}`) ||
      (entry.n === summary.name &&
        entry.la === summary.lat &&
        entry.lo === summary.lon),
  );
}

/** Include North/South (etc.) layouts that share a catalog facility id. */
export function expandCatalogFacilitySiblings(
  courses: GolfCourseSummary[],
  lat: number,
  lon: number,
): GolfCourseSummary[] {
  const out = [...courses];
  const seen = new Set(out.map((course) => course.id));

  for (const course of courses) {
    const entry = findCatalogEntry(course);
    if (!entry?.fac) continue;
    for (const sibling of US_CATALOG) {
      if (sibling.fac !== entry.fac) continue;
      const summary = entryToSummary(sibling, lat, lon);
      if (seen.has(summary.id)) continue;
      seen.add(summary.id);
      out.push(summary);
    }
  }

  return out;
}

export function searchUsCatalog(
  q: string,
  lat: number,
  lon: number,
  limit: number,
): GolfCourseSummary[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const tokens = queryTokens(q);
  const ranked: Array<{ course: GolfCourseSummary; score: number }> = [];

  for (const entry of US_CATALOG) {
    const score = catalogMatchScore(entry, needle, tokens);
    if (score >= 9) continue;
    ranked.push({
      course: entryToSummary(entry, lat, lon),
      score: score - (entry.q === 1 ? 0.5 : 0),
    });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return (a.course.distanceMi ?? 9_999) - (b.course.distanceMi ?? 9_999);
  });

  return expandCatalogFacilitySiblings(
    ranked.slice(0, Math.max(limit, 40)).map((row) => row.course),
    lat,
    lon,
  ).slice(0, limit);
}

export function nearbyUsCatalog(
  lat: number,
  lon: number,
  radiusM: number,
  limit: number,
): GolfCourseSummary[] {
  const radiusMi = (radiusM / 1000) * MI_PER_KM;
  const out: GolfCourseSummary[] = [];

  for (const entry of US_CATALOG) {
    const d = haversineMi(lat, lon, entry.la, entry.lo);
    if (d > radiusMi) continue;
    out.push(entryToSummary(entry, lat, lon));
  }

  out.sort((a, b) => (a.distanceMi ?? 0) - (b.distanceMi ?? 0));
  return out.slice(0, limit);
}
