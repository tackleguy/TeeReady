// Golf course discovery.
//
// Nearby: Photon reverse search around the selected city.
// Catalog: static OpenGolf bulk index (15k+ U.S. courses) for instant name
// search, then Photon / Nominatim / live OpenGolf as fallbacks.
// Query variants ("golf", "country club", …) catch park complexes that
// OSM names by hole course rather than park (e.g. Griffith → Wilson/Harding).

import {
  centerOf,
  errResponse,
  jsonResponse,
  overpass,
  quantizeCoord,
  UA,
  type OsmElement,
} from './_lib/overpass';
import { bboxFromLatLon, fetchOsmMapElements, padBbox } from './_lib/osmMap';
import { isClubSibling } from './_lib/courseRelate';
import {
  classifyVenueKind,
  isPlayableCourse,
  type VenueKind,
} from './_lib/venueKind';
import { nearbyUsCatalog, searchUsCatalog } from './_lib/usCatalogSearch';
import { rateLimit, RATE } from '../_lib/rateLimit';

export const config = { runtime: 'edge' };

export type CourseAccess = 'public' | 'private' | 'resort' | 'unknown';

export interface GolfCourseSummary {
  id: string;
  osmType: 'way' | 'relation' | 'node';
  osmId: number;
  name: string;
  lat: number;
  lon: number;
  /** Course bounds as [south, west, north, east] when known. */
  bbox?: [number, number, number, number];
  holes?: number;
  par?: number;
  website?: string;
  region?: string;
  /** Best-effort public / private / resort label from name + OSM tags. */
  access?: CourseAccess;
  /** Outdoor course vs indoor sim bay vs practice range. */
  kind?: VenueKind;
  /** ISO country when known (US, CA, MX, …). */
  country?: string;
  /** regulation | executive | par3 | unknown */
  courseType?: 'regulation' | 'executive' | 'par3' | 'unknown';
  distanceMi?: number;
}

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

interface PhotonFeature {
  properties?: {
    name?: string;
    osm_type?: string;
    osm_id?: number;
    website?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    city?: string;
    county?: string;
    /** [minLon, maxLat, maxLon, minLat] */
    extent?: number[];
    extratags?: Record<string, string>;
  };
  geometry?: { coordinates?: number[] };
}

function photonOsmType(t: string | undefined): 'way' | 'relation' | 'node' {
  if (t === 'W') return 'way';
  if (t === 'R') return 'relation';
  return 'node';
}

/**
 * Infer access from the course name + any OSM access tag Photon surfaces.
 * Keep this permissive — never drop a course because it looks private.
 */
export function classifyAccess(
  name: string,
  tags?: Record<string, string | undefined>,
): CourseAccess {
  const access = (tags?.access ?? '').toLowerCase();
  if (
    access === 'private' ||
    access === 'members' ||
    access.includes('private')
  ) {
    return 'private';
  }
  if (access === 'yes' || access === 'public' || access === 'customers') {
    return 'public';
  }

  const n = name.toLowerCase();
  if (
    /\b(municipal|muni|city|county|metro|public|park golf|recreation|rec\.?\s*center)\b/.test(
      n,
    ) ||
    /\b(wilson|harding|rancho park|dyker beach|bethpage|lincoln park|griffith|torrey pines)\b/.test(
      n,
    )
  ) {
    return 'public';
  }
  if (
    /\b(resort|lodge|hotel|links at|casino|pebble beach)\b/.test(n)
  ) {
    return 'resort';
  }
  if (
    /\b(country club|golf club|yacht club|private|members? only)\b/.test(n) ||
    /\b(augusta national|shinnecock|cypress point|pine valley|winged foot|oakmont|merion|riviera)\b/.test(
      n,
    )
  ) {
    return 'private';
  }
  return 'unknown';
}

/** Keep Wilson/Harding-style alias hits only when the query asked for them. */
function catalogAliasKeep(needle: string): boolean {
  return /griffith|sepulveda|encino.*golf|balboa.*golf|bethpage|torrey|pelican|riviera/i.test(
    needle,
  );
}

function courseFromPhoton(
  f: PhotonFeature,
  origin?: { lat: number; lon: number },
): GolfCourseSummary | null {
  const coords = f.geometry?.coordinates;
  const p = f.properties;
  if (!coords || coords.length < 2 || !p) return null;
  const cLon = coords[0]!;
  const cLat = coords[1]!;
  if (!Number.isFinite(cLat) || !Number.isFinite(cLon)) return null;
  const osmType = photonOsmType(p.osm_type);
  const osmId = p.osm_id ?? 0;
  if (!osmId) return null;
  const e = p.extent;
  const name = p.name?.trim() || 'Unnamed golf course';
  return {
    id: `${osmType}/${osmId}`,
    osmType,
    osmId,
    name,
    lat: cLat,
    lon: cLon,
    bbox:
      e && e.length === 4
        ? [
            Math.min(e[1]!, e[3]!),
            Math.min(e[0]!, e[2]!),
            Math.max(e[1]!, e[3]!),
            Math.max(e[0]!, e[2]!),
          ]
        : undefined,
    website: p.website,
    region:
      [p.city, p.state, p.country].filter(Boolean).join(', ') || undefined,
    access: classifyAccess(name, p.extratags),
    kind: classifyVenueKind(name, p.extratags),
    distanceMi: origin
      ? haversineMi(origin.lat, origin.lon, cLat, cLon)
      : undefined,
  };
}

async function photonCourses(
  lat: number,
  lon: number,
  radiusM: number,
  limit: number,
  signal: AbortSignal,
): Promise<GolfCourseSummary[]> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    radius: String(Math.max(1, Math.round(radiusM / 1000))),
    limit: String(Math.min(Math.max(limit * 2, 40), 50)),
    lang: 'en',
  });
  params.append('osm_tag', 'leisure:golf_course');

  try {
    const res = await fetch(`https://photon.komoot.io/reverse?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return [];
    const gj = (await res.json()) as { features?: PhotonFeature[] };

    const radiusMi = (radiusM / 1000) * MI_PER_KM;
    const out: GolfCourseSummary[] = [];
    const seen = new Set<string>();
    for (const f of gj.features ?? []) {
      const course = courseFromPhoton(f, { lat, lon });
      if (!course) continue;
      // Photon's radius is a soft bias, so enforce the range ourselves.
      if ((course.distanceMi ?? Infinity) > radiusMi * 1.2) continue;
      if (seen.has(course.id)) continue;
      seen.add(course.id);
      out.push(course);
    }
    return out;
  } catch {
    return [];
  }
}

/** Build query variants so park names and club nicknames still hit OSM. */
function catalogQueries(q: string): string[] {
  const base = q.trim().replace(/\s+/g, ' ');
  if (!base) return [];
  const lower = base.toLowerCase();
  const variants = new Set<string>([base]);

  const alreadyGolf = /\bgolf\b|\bcountry club\b|\bclub\b|\blinks\b/.test(
    lower,
  );
  if (!alreadyGolf) {
    variants.add(`${base} golf`);
    variants.add(`${base} golf course`);
    variants.add(`${base} country club`);
    variants.add(`${base} golf club`);
  }

  // Famous complexes whose OSM names omit the park / nickname.
  if (/griffith/.test(lower)) {
    variants.add('Wilson Golf Course Los Angeles');
    variants.add('Harding Golf Course Los Angeles');
  }
  if (/sepulveda|encino.*golf|balboa.*golf/.test(lower)) {
    variants.add('Balboa Golf Course');
    variants.add('Encino Golf Course');
  }
  if (/bethpage/.test(lower) && !/black|red|blue|green|yellow/.test(lower)) {
    variants.add('Bethpage Black');
    variants.add('Bethpage Red');
    variants.add('Bethpage Blue');
  }
  if (/torrey/.test(lower)) {
    variants.add('Torrey Pines North');
    variants.add('Torrey Pines South');
  }
  if (/pelican/.test(lower) && /bay/.test(lower)) {
    variants.add('Club at Pelican Bay North');
    variants.add('Club at Pelican Bay South');
  }
  if (/pelican/.test(lower) && !/bay/.test(lower)) {
    variants.add('Pelican Hill North');
    variants.add('Pelican Hill South');
  }
  if (/riviera/.test(lower)) {
    variants.add('Riviera Country Club');
    variants.add('Riviera Country Club Pacific Palisades');
  }

  const hasDirection = /\b(north|south|east|west|nines?)\b/.test(lower);
  if (!hasDirection) {
    for (const dir of ['North', 'South', 'East', 'West']) {
      variants.add(`${base} ${dir}`);
    }
  }

  return [...variants].slice(0, 8);
}

async function photonSearchOnce(
  q: string,
  lat: number,
  lon: number,
  signal: AbortSignal,
): Promise<PhotonFeature[]> {
  const params = new URLSearchParams({
    q,
    limit: '40',
    lang: 'en',
    // Bias toward the user's city so municipal courses near them rank first,
    // while still returning famous privates nationwide.
    lat: String(lat),
    lon: String(lon),
  });
  params.append('osm_tag', 'leisure:golf_course');
  try {
    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return [];
    const gj = (await res.json()) as { features?: PhotonFeature[] };
    return gj.features ?? [];
  } catch {
    return [];
  }
}

/** Significant tokens from the user query used to keep catalog hits on-topic. */
function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 4 &&
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
  if (n.includes(needle) && needle.length >= 5) return 1;
  if (!tokens.length) return n.includes(needle.split(/\s+/)[0] ?? '') ? 3 : 9;
  const hits = tokens.filter((t) => n.includes(t)).length;
  // Require every distinctive token — "country"/"beach" alone is not enough.
  if (hits === tokens.length) return 2;
  if (hits >= Math.ceil(tokens.length * 0.67) && hits >= 1) return 4;
  return 9;
}

/** Search the bundled U.S. catalog (15k+ courses, instant). */
function staticCatalog(
  q: string,
  lat: number,
  lon: number,
  limit: number,
): GolfCourseSummary[] {
  return searchUsCatalog(q, lat, lon, limit);
}

/**
 * Search U.S. courses by name via Photon (fallback when static catalog misses).
 * OSM's leisure=golf_course index contains municipal/public, resort,
 * country-club, and private courses; do not add an `access` filter here.
 */
async function photonCatalog(
  q: string,
  lat: number,
  lon: number,
  limit: number,
  signal: AbortSignal,
): Promise<GolfCourseSummary[]> {
  const queries = catalogQueries(q);
  const settled = await Promise.allSettled(
    queries.map((query) => photonSearchOnce(query, lat, lon, signal)),
  );
  const features = settled.flatMap((row) =>
    row.status === 'fulfilled' ? row.value : [],
  );

  const needle = q.trim().toLowerCase();
  const tokens = queryTokens(q);
  const seen = new Set<string>();
  const courses: GolfCourseSummary[] = [];
  for (const feature of features) {
    const countryCode = feature.properties?.countrycode?.toUpperCase();
    if (countryCode !== 'US') continue;
    const course = courseFromPhoton(feature, { lat, lon });
    if (!course || seen.has(course.id)) continue;
    // Drop Photon neighbors that only appeared because of city bias —
    // keep courses that share meaningful tokens with the query.
    if (
      tokens.length &&
      nameMatchScore(course.name, needle, tokens) >= 9 &&
      !(
        catalogAliasKeep(needle) &&
        /wilson|harding|bethpage|balboa|encino/i.test(course.name)
      )
    ) {
      continue;
    }
    seen.add(course.id);
    courses.push(course);
  }

  courses.sort((a, b) => {
    const aScore = nameMatchScore(a.name, needle, tokens);
    const bScore = nameMatchScore(b.name, needle, tokens);
    if (aScore !== bScore) return aScore - bScore;
    // Mild preference for labeled public + private over unknowns.
    const aKind = a.access === 'unknown' ? 1 : 0;
    const bKind = b.access === 'unknown' ? 1 : 0;
    if (aKind !== bKind) return aKind - bKind;
    return (a.distanceMi ?? 9_999) - (b.distanceMi ?? 9_999);
  });

  return courses.slice(0, limit);
}

interface NominatimHit {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  class?: string;
  type?: string;
  boundingbox?: string[];
  extratags?: Record<string, string>;
  address?: { city?: string; state?: string; country?: string };
}

function nominatimOsmType(t: string | undefined): 'way' | 'relation' | 'node' {
  if (t === 'way') return 'way';
  if (t === 'relation') return 'relation';
  return 'node';
}

async function nominatimCatalog(
  q: string,
  lat: number,
  lon: number,
  limit: number,
  signal: AbortSignal,
): Promise<GolfCourseSummary[]> {
  const needle = q.trim();
  const queries = catalogQueries(needle).slice(0, 3);
  const hits: NominatimHit[] = [];
  for (const query of queries) {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      limit: '20',
      addressdetails: '1',
      extratags: '1',
      countrycodes: 'us',
    });
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?${params}`,
        { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal },
      );
      if (!res.ok) continue;
      const rows = (await res.json()) as NominatimHit[];
      hits.push(...rows);
    } catch {
      // Nominatim is a backup — never fail the whole search.
    }
  }

  const tokens = queryTokens(needle);
  const seen = new Set<string>();
  const courses: GolfCourseSummary[] = [];
  for (const hit of hits) {
    const isGolf =
      hit.type === 'golf_course' ||
      hit.class === 'leisure' ||
      /golf|country club|links/i.test(`${hit.name ?? ''} ${hit.display_name ?? ''}`);
    if (!isGolf) continue;
    const osmId = Number(hit.osm_id);
    const cLat = Number(hit.lat);
    const cLon = Number(hit.lon);
    if (!Number.isFinite(osmId) || !Number.isFinite(cLat) || !Number.isFinite(cLon)) {
      continue;
    }
    const osmType = nominatimOsmType(hit.osm_type);
    const id = `${osmType}/${osmId}`;
    if (seen.has(id)) continue;
    const name =
      hit.name?.trim() ||
      hit.display_name?.split(',')[0]?.trim() ||
      'Unnamed golf course';
    if (nameMatchScore(name, needle.toLowerCase(), tokens) >= 9) continue;
    seen.add(id);
    const bb = hit.boundingbox;
    const south = bb ? Number(bb[0]) : NaN;
    const north = bb ? Number(bb[1]) : NaN;
    const west = bb ? Number(bb[2]) : NaN;
    const east = bb ? Number(bb[3]) : NaN;
    courses.push({
      id,
      osmType,
      osmId,
      name,
      lat: cLat,
      lon: cLon,
      bbox:
        [south, west, north, east].every(Number.isFinite)
          ? [south, west, north, east]
          : undefined,
      website: hit.extratags?.website,
      region:
        [hit.address?.city, hit.address?.state, hit.address?.country]
          .filter(Boolean)
          .join(', ') || undefined,
      access: classifyAccess(name, hit.extratags),
      kind: classifyVenueKind(name, hit.extratags),
      distanceMi: haversineMi(lat, lon, cLat, cLon),
    });
  }

  courses.sort(
    (a, b) =>
      nameMatchScore(a.name, needle.toLowerCase(), tokens) -
        nameMatchScore(b.name, needle.toLowerCase(), tokens) ||
      (a.distanceMi ?? 9_999) - (b.distanceMi ?? 9_999),
  );
  return courses.slice(0, limit);
}

async function opengolfCatalog(
  q: string,
  lat: number,
  lon: number,
  limit: number,
  signal: AbortSignal,
): Promise<GolfCourseSummary[]> {
  try {
    const params = new URLSearchParams({ q: q.trim() });
    const res = await fetch(
      `https://api.opengolfapi.org/v1/courses/search?${params}`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as {
      courses?: Array<{
        id?: string;
        name?: string;
        latitude?: number;
        longitude?: number;
        city?: string;
        state?: string;
        type?: string;
        par?: number;
        osm_id?: number;
      }>;
    };
    const tokens = queryTokens(q);
    const needle = q.trim().toLowerCase();
    const out: GolfCourseSummary[] = [];
    const seen = new Set<string>();
    for (const row of body.courses ?? []) {
      const name = row.name?.trim();
      const cLat = Number(row.latitude);
      const cLon = Number(row.longitude);
      if (!name || !Number.isFinite(cLat) || !Number.isFinite(cLon)) continue;
      if (nameMatchScore(name, needle, tokens) >= 9) continue;
      const osmId = Number(row.osm_id);
      const id = Number.isFinite(osmId) && osmId > 0
        ? `way/${osmId}`
        : `opengolf/${row.id ?? `${cLat},${cLon}`}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        osmType: Number.isFinite(osmId) && osmId > 0 ? 'way' : 'node',
        osmId: Number.isFinite(osmId) && osmId > 0 ? osmId : 0,
        name,
        lat: cLat,
        lon: cLon,
        par: Number.isFinite(Number(row.par)) ? Number(row.par) : undefined,
        region: [row.city, row.state].filter(Boolean).join(', ') || undefined,
        access: classifyAccess(name),
        kind: classifyVenueKind(name),
        distanceMi: haversineMi(lat, lon, cLat, cLon),
      });
    }
    out.sort((a, b) => (a.distanceMi ?? 9_999) - (b.distanceMi ?? 9_999));
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

async function overpassCourses(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
  radiusM: number,
): Promise<GolfCourseSummary[]> {
  // No access=* filter — private clubs must stay in the list.
  const query = `
[out:json][timeout:25];
nwr["leisure"="golf_course"](around:${radiusM},${lat},${lon});
out center tags bb;
`.trim();

  const raw = (await overpass(query, { timeoutMs: 3_500, hedgeMs: 900 })) as {
    elements?: Array<
      OsmElement & {
        bounds?: {
          minlat: number;
          minlon: number;
          maxlat: number;
          maxlon: number;
        };
      }
    >;
  };

  const courses: GolfCourseSummary[] = [];
  for (const el of raw.elements ?? []) {
    const c = centerOf(el);
    if (!c) continue;
    const tags = el.tags ?? {};
    const holes = tags.holes ? Number(tags.holes) : undefined;
    const par = tags.par ? Number(tags.par) : undefined;
    const b = el.bounds;
    const name = tags.name?.trim() || 'Unnamed golf course';
    courses.push({
      id: `${el.type}/${el.id}`,
      osmType: el.type as 'way' | 'relation' | 'node',
      osmId: el.id,
      name,
      lat: c.lat,
      lon: c.lon,
      bbox: b ? [b.minlat, b.minlon, b.maxlat, b.maxlon] : undefined,
      holes: Number.isFinite(holes) ? holes : undefined,
      par: Number.isFinite(par) ? par : undefined,
      website: tags.website || tags['contact:website'],
      access: classifyAccess(name, tags),
      kind: classifyVenueKind(name, tags),
      distanceMi: haversineMi(originLat, originLon, c.lat, c.lon),
    });
  }
  return courses;
}

/** Direct OSM map.json course discovery when Photon + Overpass are down. */
async function mapCourses(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number,
  radiusM: number,
): Promise<GolfCourseSummary[]> {
  const box = padBbox(bboxFromLatLon(lat, lon, Math.min(radiusM, 3500)), 0.15);
  const elements = await fetchOsmMapElements(box, {
    timeoutMs: 2_500,
    attempts: 1,
  });
  if (!elements) return [];

  const courses: GolfCourseSummary[] = [];
  for (const el of elements) {
    if (el.type !== 'way' && el.type !== 'relation') continue;
    if (el.tags?.leisure !== 'golf_course') continue;
    const c = centerOf(el);
    if (!c) continue;
    const tags = el.tags ?? {};
    const holes = tags.holes ? Number(tags.holes) : undefined;
    const par = tags.par ? Number(tags.par) : undefined;
    const name = tags.name?.trim() || 'Unnamed golf course';
    let bbox: [number, number, number, number] | undefined;
    if (el.geometry?.length) {
      let s = Infinity;
      let w = Infinity;
      let n = -Infinity;
      let e = -Infinity;
      for (const pt of el.geometry) {
        s = Math.min(s, pt.lat);
        n = Math.max(n, pt.lat);
        w = Math.min(w, pt.lon);
        e = Math.max(e, pt.lon);
      }
      if (Number.isFinite(s)) bbox = [s, w, n, e];
    }
    courses.push({
      id: `${el.type}/${el.id}`,
      osmType: el.type as 'way' | 'relation',
      osmId: el.id,
      name,
      lat: c.lat,
      lon: c.lon,
      bbox,
      holes: Number.isFinite(holes) ? holes : undefined,
      par: Number.isFinite(par) ? par : undefined,
      website: tags.website || tags['contact:website'],
      access: classifyAccess(name, tags),
      kind: classifyVenueKind(name, tags),
      distanceMi: haversineMi(originLat, originLon, c.lat, c.lon),
    });
  }
  return courses;
}

function playableCourses(courses: GolfCourseSummary[]): GolfCourseSummary[] {
  return dedupeCourses(
    courses.filter((c) => {
      if (!isPlayableCourse(c.kind)) return false;
      // Drop known non-standard layouts (27-hole complexes, 19-hole oddities, etc.).
      if (c.holes != null && c.holes !== 9 && c.holes !== 18) return false;
      return true;
    }),
  );
}

function normCourseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(golf|course|club|country|the|and)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Collapse Photon+catalog duplicates (same club, different id/region string). */
function dedupeCourses(courses: GolfCourseSummary[]): GolfCourseSummary[] {
  const out: GolfCourseSummary[] = [];
  for (const course of courses) {
    const key = normCourseName(course.name);
    const idx = out.findIndex((other) => {
      if (normCourseName(other.name) !== key) return false;
      return haversineMi(course.lat, course.lon, other.lat, other.lon) < 1.2;
    });
    if (idx < 0) {
      out.push(course);
      continue;
    }
    const prev = out[idx]!;
    const score = (c: GolfCourseSummary) =>
      (c.holes === 9 || c.holes === 18 ? 8 : 0) +
      (c.par != null ? 4 : 0) +
      (c.region?.includes(',') && c.region.length < 24 ? 2 : 0) +
      (c.access && c.access !== 'unknown' ? 1 : 0) +
      (c.osmId > 0 ? 1 : 0);
    if (score(course) > score(prev)) out[idx] = course;
  }
  return out;
}

function mergeCourses(
  primary: GolfCourseSummary[],
  extra: GolfCourseSummary[],
): GolfCourseSummary[] {
  const seen = new Set(primary.map((c) => c.id));
  const out = [...primary];
  for (const course of extra) {
    if (seen.has(course.id)) continue;
    seen.add(course.id);
    out.push(course);
  }
  return out;
}

/** OSM often lists North/South as separate polygons Photon omits from reverse search. */
function expandWithOsmSiblings(
  primary: GolfCourseSummary[],
  osm: GolfCourseSummary[],
  maxMi = 2.5,
): GolfCourseSummary[] {
  if (!primary.length || !osm.length) return primary;
  const out = [...primary];
  const seen = new Set(primary.map((c) => c.id));
  for (const seed of primary) {
    for (const sibling of osm) {
      if (seen.has(sibling.id)) continue;
      const d = haversineMi(seed.lat, seed.lon, sibling.lat, sibling.lon);
      if (d > maxMi) continue;
      if (!isClubSibling(seed.name, sibling.name)) continue;
      seen.add(sibling.id);
      out.push(sibling);
    }
  }
  return out;
}

export default async function handler(req: Request): Promise<Response> {
  const limited = rateLimit(req, RATE.courses);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const rawLat = Number(searchParams.get('lat'));
  const rawLon = Number(searchParams.get('lon'));
  const q = searchParams.get('q')?.trim() ?? '';
  const radiusM = Math.min(
    Math.max(Number(searchParams.get('radius') ?? 40_000), 2000),
    80_000,
  );
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 40), 1),
    60,
  );

  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
    return errResponse('lat and lon required', 400);
  }

  const lat = quantizeCoord(rawLat, 3);
  const lon = quantizeCoord(rawLon, 3);

  const finish = (
    courses: GolfCourseSummary[],
    source:
      | 'catalog'
      | 'photon'
      | 'overpass'
      | 'osm-map'
      | 'nominatim'
      | 'opengolf',
    opts?: { preserveOrder?: boolean },
  ) =>
    jsonResponse(
      {
        courses: playableCourses(
          opts?.preserveOrder
            ? courses
            : [...courses].sort(
                (a, b) => (a.distanceMi ?? 0) - (b.distanceMi ?? 0),
              ),
        ).slice(0, limit),
        source,
        attribution: '© OpenStreetMap contributors (ODbL)',
      },
      1800,
      86_400,
    );

  if (q.length >= 2) {
    // Name search: static catalog is instant. Never block on Overpass.
    let courses = staticCatalog(q, rawLat, rawLon, limit);
    let source: 'catalog' | 'photon' | 'nominatim' | 'opengolf' = 'catalog';
    if (!courses.length) {
      const catalogAc = new AbortController();
      const catalogStop = setTimeout(() => catalogAc.abort(), 2_500);
      try {
        courses = await photonCatalog(
          q,
          rawLat,
          rawLon,
          limit,
          catalogAc.signal,
        );
        source = 'photon';
        if (!courses.length) {
          courses = await nominatimCatalog(
            q,
            rawLat,
            rawLon,
            limit,
            catalogAc.signal,
          );
          source = 'nominatim';
        }
        if (!courses.length) {
          courses = await opengolfCatalog(
            q,
            rawLat,
            rawLon,
            limit,
            catalogAc.signal,
          );
          source = 'opengolf';
        }
      } catch {
        courses = [];
      } finally {
        clearTimeout(catalogStop);
      }
    }
    return finish(courses, source, { preserveOrder: true });
  }

  // Nearby: catalog is the fast path (14k US courses). Live OSM is optional
  // enrichment with a hard budget — never wait 16s+ on Overpass for a list.
  const staticNearby = nearbyUsCatalog(rawLat, rawLon, radiusM, limit);

  // Instant path when the bundled catalog already covers the area.
  if (staticNearby.length >= 8) {
    return finish(staticNearby, 'catalog');
  }

  const enrichMs = 2_800;
  const enrichAc = new AbortController();
  const enrichStop = setTimeout(() => enrichAc.abort(), enrichMs);
  const deadline = new Promise<GolfCourseSummary[]>((resolve) => {
    setTimeout(() => resolve([]), enrichMs);
  });
  try {
    const photonP = photonCourses(
      rawLat,
      rawLon,
      radiusM,
      limit,
      enrichAc.signal,
    ).catch(() => [] as GolfCourseSummary[]);
    const mapP = mapCourses(
      lat,
      lon,
      rawLat,
      rawLon,
      Math.min(radiusM, 4_000),
    ).catch(() => [] as GolfCourseSummary[]);
    const overpassP = overpassCourses(
      lat,
      lon,
      rawLat,
      rawLon,
      Math.min(radiusM, 12_000),
    ).catch(() => [] as GolfCourseSummary[]);

    const [photon, map, osm] = await Promise.all([
      Promise.race([photonP, deadline]),
      Promise.race([mapP, deadline]),
      Promise.race([overpassP, deadline]),
    ]);
    const merged = expandWithOsmSiblings(
      mergeCourses(staticNearby.length ? staticNearby : photon, photon),
      mergeCourses(osm, map),
    );
    const source = staticNearby.length
      ? 'catalog'
      : photon.length
        ? 'photon'
        : osm.length
          ? 'overpass'
          : map.length
            ? 'osm-map'
            : 'catalog';
    return finish(merged.length ? merged : staticNearby, source);
  } finally {
    clearTimeout(enrichStop);
  }
}
