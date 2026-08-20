// Client types + fetchers for the Golf section.
// Memory + sessionStorage cache so reopening a course / city is instant.

import type { GolfPlayerProfile } from './golfProfile';

export interface GolfCourseSummary {
  id: string;
  osmType: 'way' | 'relation' | 'node';
  osmId: number;
  name: string;
  lat: number;
  lon: number;
  /** Course bounds as [south, west, north, east] when OSM knows them. */
  bbox?: [number, number, number, number];
  holes?: number;
  par?: number;
  website?: string;
  region?: string;
  /** Best-effort public / private / resort label. */
  access?: 'public' | 'private' | 'resort' | 'unknown';
  distanceMi?: number;
}

export type TeeKind = 'back' | 'mid' | 'front';

export interface GolfTeeBox {
  id: string;
  label: string;
  kind: TeeKind;
  color?: string;
  yards: number;
  bearingDeg: number;
  tee: { lat: number; lon: number };
  path?: Array<{ lat: number; lon: number }>;
  teeElevationM?: number;
}

export interface GolfHole {
  number: number;
  name?: string;
  par?: number;
  yards: number;
  bearingDeg: number;
  tee: { lat: number; lon: number };
  green: { lat: number; lon: number };
  teeElevationM?: number;
  greenElevationM?: number;
  path?: Array<{ lat: number; lon: number }>;
  source: 'hole-way' | 'tee-green';
  /** North / South / East / West layout when a club has more than one 18. */
  loop?: string;
  tees?: GolfTeeBox[];
}

export interface TurfReport {
  fairway: 'soft' | 'medium' | 'firm';
  green: 'soft' | 'medium' | 'firm';
  precipIn48h: number;
  et0Mm48h: number;
  humidityPct: number;
  soilMoisture: number | null;
  fairwayRollYd: number;
  greenReleaseYd: number;
  note: string;
}

export const DEFAULT_TURF: TurfReport = {
  fairway: 'medium',
  green: 'medium',
  precipIn48h: 0.1,
  et0Mm48h: 6,
  humidityPct: 55,
  soilMoisture: null,
  fairwayRollYd: 5,
  greenReleaseYd: 6,
  note: 'Checking rain, soil, and drying for turf firmness…',
};

export interface HoleBrief {
  number: number;
  yards: number;
  bearingDeg: number;
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  /** Positive = into the player, negative = helping. */
  headwindMph: number;
  /** Positive = pushes the ball right of the tee→green line. */
  crosswindMph: number;
  /** Estimated lateral drift at the green, yards; positive = right. */
  driftYards: number;
  /** Elevation contribution to plays-like; positive is uphill. */
  slopeYards: number;
  elevationChangeFt: number;
  windAdjustmentYards: number;
  playsLikeYards: number;
  aspect: string;
  tip: string;
  clubHint: string;
  recommendedClub: string;
  modelAgreement: number;
}

export interface GolfEnsemble {
  lat: number;
  lon: number;
  hour: number;
  time: string | null;
  ensemble: {
    windFromDeg: number;
    windMph: number;
    gustMph: number;
    agreement: number;
    modelsUsed: string[];
    modelsFailed: Array<{ model: string; reason?: string }>;
  };
  summary: string;
  turf?: TurfReport;
  holes: HoleBrief[];
  attribution: string;
}

const MEM = new Map<string, { at: number; data: unknown }>();
const COURSES_TTL_MS = 30 * 60_000;
const HOLES_TTL_MS = 6 * 60 * 60_000;

function q3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function q4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function memGet<T>(key: string, ttl: number): T | null {
  const hit = MEM.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ttl) {
    MEM.delete(key);
    return null;
  }
  return hit.data as T;
}

function memSet(key: string, data: unknown): void {
  MEM.set(key, { at: Date.now(), data });
}

function sessionGet<T>(key: string, ttl: number): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (Date.now() - parsed.at > ttl) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function sessionSet(key: string, data: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // quota / private mode — memory cache still helps
  }
}

/**
 * Public Overpass instances answer 504/429 whenever they are busy, and a
 * different mirror usually succeeds moments later, so retry briefly.
 */
async function fetchWithRetry(
  url: string,
  signal: AbortSignal | undefined,
  attempts = 3,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 900 * i));
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    }
    try {
      const res = await fetch(url, { signal });
      // 5xx means upstream OSM trouble; anything else is final.
      if (res.ok || res.status < 500) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('OpenStreetMap request failed');
}

export async function fetchGolfCourses(
  lat: number,
  lon: number,
  opts?: { q?: string; radius?: number; signal?: AbortSignal },
): Promise<GolfCourseSummary[]> {
  const q = opts?.q?.trim().toLowerCase() ?? '';
  // v2 invalidates empty results cached by the retired Nominatim/Overpass
  // discovery path.
  const key = `golf:v6:courses:${q3(lat)}:${q3(lon)}:${q}:${opts?.radius ?? ''}`;
  const cached =
    memGet<GolfCourseSummary[]>(key, COURSES_TTL_MS) ??
    sessionGet<GolfCourseSummary[]>(key, COURSES_TTL_MS);
  if (cached) {
    memSet(key, cached);
    return cached;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    v: '3',
  });
  if (q) params.set('q', q);
  if (opts?.radius) params.set('radius', String(opts.radius));
  let res: Response;
  try {
    res = await fetchWithRetry(
      `/api/golf/courses?${params}`,
      opts?.signal,
      2,
    );
  } catch {
    // Upstream OSM mirrors occasionally answer 502/503 after retries.
    return [];
  }
  if (!res.ok) {
    if (res.status >= 500) return [];
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? `courses ${res.status}`);
  }
  const data = (await res.json()) as { courses: GolfCourseSummary[] };
  const courses = data.courses ?? [];
  memSet(key, courses);
  sessionSet(key, courses);
  return courses;
}

export async function fetchGolfHoles(
  lat: number,
  lon: number,
  opts?: {
    radius?: number;
    bbox?: [number, number, number, number];
    osmType?: string;
    osmId?: number;
    courseName?: string;
    signal?: AbortSignal;
  },
): Promise<GolfHole[]> {
  // Synthesize a ~1.4 km box when Photon had no extent — still better than a
  // blind tiny radius for sprawling clubs.
  const bbox =
    opts?.bbox ??
    ([
      lat - 0.012,
      lon - 0.012 / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
      lat + 0.012,
      lon + 0.012 / Math.max(0.2, Math.cos((lat * Math.PI) / 180)),
    ] as [number, number, number, number]);
  const bboxKey = bbox.map((n) => q4(n)).join(',');
  const courseKey = [
    opts?.osmType ?? '',
    opts?.osmId ?? '',
    opts?.courseName?.trim().toLowerCase() ?? '',
  ].join(':');
  // Course identity matters here: nearby sibling layouts can share a center
  // point or even a synthesized bbox, and reusing the wrong hole payload
  // makes tee selection feel random when hopping between courses.
  const key =
    `golf:v11:holes:${q4(lat)}:${q4(lon)}:${bboxKey}:` +
    `${opts?.radius ?? ''}:${courseKey}`;
  const cached =
    memGet<GolfHole[]>(key, HOLES_TTL_MS) ??
    sessionGet<GolfHole[]>(key, HOLES_TTL_MS);
  // Never reuse an empty cache entry — that freezes a transient Overpass miss.
  if (cached && cached.length > 0) {
    memSet(key, cached);
    return cached;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    v: '10',
  });
  if (opts?.radius) params.set('radius', String(opts.radius));
  params.set('bbox', bboxKey);
  if (opts?.osmType && opts.osmId) {
    params.set('osmType', opts.osmType);
    params.set('osmId', String(opts.osmId));
  }
  if (opts?.courseName) params.set('courseName', opts.courseName);

  // Escalating radii so a rate-limited first attempt still lands geometry.
  const radii = opts?.bbox
    ? [opts.radius ?? 1800]
    : [opts?.radius ?? 1800, 2800];
  let lastErr: unknown = null;
  for (const radius of radii) {
    if (opts?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    params.set('radius', String(radius));
    try {
      const res = await fetchWithRetry(
        `/api/golf/holes?${params}`,
        opts?.signal,
        2,
      );
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        lastErr = new Error(detail?.error ?? `holes ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { holes: GolfHole[] };
      const holes = data.holes ?? [];
      if (holes.length) {
        memSet(key, holes);
        sessionSet(key, holes);
        return holes;
      }
      // Empty but successful — OSM may simply not have hole tags; stop.
      return [];
    } catch (err) {
      if (opts?.signal?.aborted) throw err;
      lastErr = err;
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Failed to load hole geometry');
}

export interface GolfNotebookDay {
  date: string;
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  agreement: number;
  modelsUsed: string[];
}

export interface GolfNotebookHoleDay {
  date: string;
  aspect: string;
  headwindMph: number;
  playsLikeYards: number;
  recommendedClub: string;
  clubHint: string;
}

export interface GolfNotebookHole {
  number: number;
  name?: string;
  par?: number;
  yards: number;
  bearingDeg: number;
  teeElevationFt: number | null;
  greenElevationFt: number | null;
  slopeYards: number;
  elevationChangeFt: number;
  seaLevelYards: number;
  days: GolfNotebookHoleDay[];
}

export interface GolfNotebook {
  lat: number;
  lon: number;
  generatedAt: string;
  elevationFt: number;
  altitudeBonusPct: number;
  days: GolfNotebookDay[];
  holes: GolfNotebookHole[];
  modelsFailed: Array<{ model: string; reason?: string }>;
  attribution: string;
}

const NOTEBOOK_TTL_MS = 15 * 60_000;

export async function fetchGolfNotebook(
  lat: number,
  lon: number,
  holes: Array<
    Pick<
      GolfHole,
      | 'number'
      | 'yards'
      | 'bearingDeg'
      | 'par'
      | 'name'
      | 'teeElevationM'
      | 'greenElevationM'
    >
  >,
  player?: GolfPlayerProfile | null,
  signal?: AbortSignal,
): Promise<GolfNotebook> {
  const key = `golf:v2:notebook:${q4(lat)}:${q4(lon)}:${holes
    .map(
      (h) =>
        `${h.number}:${h.yards}:${h.bearingDeg}:${h.teeElevationM ?? ''}:${h.greenElevationM ?? ''}`,
    )
    .join('|')}:${player?.handicap ?? ''}:${player?.sevenIronYards ?? ''}:${player?.driverYards ?? ''}`;
  const cached =
    memGet<GolfNotebook>(key, NOTEBOOK_TTL_MS) ??
    sessionGet<GolfNotebook>(key, NOTEBOOK_TTL_MS);
  if (cached) {
    memSet(key, cached);
    return cached;
  }

  const res = await fetch('/api/golf/notebook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, holes, player }),
    signal,
  });
  if (!res.ok) throw new Error(`notebook ${res.status}`);
  const data = (await res.json()) as GolfNotebook;
  memSet(key, data);
  sessionSet(key, data);
  return data;
}

export async function fetchGolfEnsemble(
  lat: number,
  lon: number,
  holes: Array<
    Pick<
      GolfHole,
      | 'number'
      | 'yards'
      | 'bearingDeg'
      | 'par'
      | 'name'
      | 'teeElevationM'
      | 'greenElevationM'
    >
  >,
  hour = 0,
  player?: GolfPlayerProfile | null,
  signal?: AbortSignal,
): Promise<GolfEnsemble> {
  const res = await fetch('/api/golf/ensemble', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lon, hour, holes, player }),
    signal,
  });
  if (!res.ok) throw new Error(`ensemble ${res.status}`);
  return (await res.json()) as GolfEnsemble;
}

/** Esri World Imagery — high-detail satellite basemap for course maps. */
export const GOLF_SATELLITE_STYLE = {
  version: 8 as const,
  name: 'Golf Satellite',
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution:
        'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'esri-sat',
      type: 'raster' as const,
      source: 'esri',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
};
