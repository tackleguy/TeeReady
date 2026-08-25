// Client types + fetchers for the Golf section.
// Memory + sessionStorage cache so reopening a course / city is instant.

import type { GolfPlayerProfile } from './golfProfile';
import { isPlayableCourse, venueKindFromName } from './venueKind';
import { courseHeroImage } from './courseImages';
import { warmSatelliteTiles } from './golfSatelliteCache';

export type VenueKind = 'course' | 'sim' | 'range';

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
  /** Outdoor course vs indoor sim bay vs practice range. */
  kind?: VenueKind;
  /** ISO country when known (US, CA, MX, …). */
  country?: string;
  /** regulation | executive | par3 | unknown */
  courseType?: 'regulation' | 'executive' | 'par3' | 'unknown';
  /** Stable hero photo URL for cards and lists. */
  photo?: string;
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
  /** Stroke index 1–18 when a scorecard provides it. */
  strokeIndex?: number;
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
  /** Present when firmness lacks ET0/soil — estimated from precip/humidity. */
  confidence?: 'full' | 'partial';
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
  note: 'Checking rain and humidity for turf firmness…',
  confidence: 'partial',
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
  modelAgreement: number | null;
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
    /** Null when only one provider responded — never invent consensus. */
    agreement: number | null;
    confidence?: 'full' | 'low' | 'single-source';
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
/** Short-lived tab cache for the exact holes request key. */
const HOLES_TTL_MS = 6 * 60 * 60_000;
/** Cap durable course-map backups in localStorage. */
const HOLES_BACKUP_MAX = 48;
/** Soft-refresh OSM when a backup already exists — keep maps opening instantly. */
const HOLES_SOFT_REFRESH_MS = 2_800;
const HOLES_BACKUP_INDEX_KEY = 'golf:v1:hole-backup-index';
const LS_PREFIX = 'teeready-golf-cache:';

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

/** Read localStorage without deleting — expired entries stay for OSM outages. */
function localGetAllowStale<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function localRemove(key: string): void {
  try {
    localStorage.removeItem(`${LS_PREFIX}${key}`);
  } catch {
    // ignore
  }
}

function localSet(key: string, data: unknown): void {
  const payload = JSON.stringify({ at: Date.now(), data });
  try {
    localStorage.setItem(`${LS_PREFIX}${key}`, payload);
  } catch {
    pruneHoleBackups(Math.floor(HOLES_BACKUP_MAX / 2));
    try {
      localStorage.setItem(`${LS_PREFIX}${key}`, payload);
    } catch {
      // quota / private mode
    }
  }
}

function readBackupIndex(): string[] {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${HOLES_BACKUP_INDEX_KEY}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((k) => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function writeBackupIndex(keys: string[]): void {
  try {
    localStorage.setItem(
      `${LS_PREFIX}${HOLES_BACKUP_INDEX_KEY}`,
      JSON.stringify(keys),
    );
  } catch {
    // ignore
  }
}

function pruneHoleBackups(keep: number): void {
  const index = readBackupIndex();
  const drop = index.slice(0, Math.max(0, index.length - keep));
  for (const key of drop) localRemove(key);
  writeBackupIndex(index.slice(drop.length));
}

function touchBackupIndex(key: string): void {
  const next = readBackupIndex().filter((k) => k !== key);
  next.push(key);
  while (next.length > HOLES_BACKUP_MAX) {
    const oldest = next.shift();
    if (oldest) localRemove(oldest);
  }
  writeBackupIndex(next);
}

function holesRequestKey(
  lat: number,
  lon: number,
  opts?: {
    radius?: number;
    bbox?: [number, number, number, number];
    osmType?: string;
    osmId?: number;
    courseName?: string;
  },
): { requestKey: string; backupKey: string; bbox: [number, number, number, number] } {
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
  const requestKey =
    `golf:v11:holes:${q4(lat)}:${q4(lon)}:${bboxKey}:` +
    `${opts?.radius ?? ''}:${courseKey}`;
  const backupKey =
    opts?.osmType && opts?.osmId
      ? `golf:v1:hole-backup:${opts.osmType}:${opts.osmId}`
      : `golf:v1:hole-backup:geo:${q3(lat)}:${q3(lon)}:${opts?.courseName?.trim().toLowerCase() ?? ''}`;
  return { requestKey, backupKey, bbox };
}

function coursesCacheKey(
  lat: number,
  lon: number,
  q: string,
  radius?: number,
): string {
  return `golf:v8:courses:${q3(lat)}:${q3(lon)}:${q}:${radius ?? ''}`;
}

/** Sync cache read — instant course list without a loading spinner. */
export function peekGolfCoursesCache(
  lat: number,
  lon: number,
  q?: string,
  radius?: number,
): GolfCourseSummary[] | null {
  const query = q?.trim().toLowerCase() ?? '';
  const key = coursesCacheKey(lat, lon, query, radius);
  const live =
    memGet<GolfCourseSummary[]>(key, COURSES_TTL_MS) ??
    sessionGet<GolfCourseSummary[]>(key, COURSES_TTL_MS);
  if (live?.length) return live;
  // Never wipe expired lists — stale courses still beat an empty OSM outage.
  const local = localGetAllowStale<GolfCourseSummary[]>(key);
  if (local?.length) {
    memSet(key, local);
    sessionSet(key, local);
    return local;
  }
  return null;
}

type HolesFetchOpts = {
  radius?: number;
  bbox?: [number, number, number, number];
  osmType?: string;
  osmId?: number;
  courseName?: string;
  signal?: AbortSignal;
};

export type GolfHolesPeek = {
  holes: GolfHole[];
  /** True when data came from durable localStorage, not this-tab cache. */
  fromBackup: boolean;
};

/** Instant course-map geometry from memory, session, or durable backup. */
export function peekGolfHolesCache(
  lat: number,
  lon: number,
  opts?: Omit<HolesFetchOpts, 'signal'>,
): GolfHole[] | null {
  return peekGolfHolesDetail(lat, lon, opts)?.holes ?? null;
}

/** Same as peekGolfHolesCache, with whether the hit was a durable backup. */
export function peekGolfHolesDetail(
  lat: number,
  lon: number,
  opts?: Omit<HolesFetchOpts, 'signal'>,
): GolfHolesPeek | null {
  const { requestKey, backupKey } = holesRequestKey(lat, lon, opts);
  // Session = OSM-confirmed this tab — instant reopen, no soft-refresh needed.
  const confirmed = sessionGet<GolfHole[]>(requestKey, HOLES_TTL_MS);
  if (confirmed?.length) {
    memSet(requestKey, confirmed);
    return { holes: confirmed, fromBackup: false };
  }
  const mem = memGet<GolfHole[]>(requestKey, HOLES_TTL_MS);
  if (mem?.length) {
    // Mem-only hits are usually a just-painted backup; treat as backup so load
    // still soft-refreshes OSM instead of skipping the network forever.
    return { holes: mem, fromBackup: true };
  }
  // Never delete backups on read — expired maps are the OSM-outage lifeline.
  const backup = localGetAllowStale<GolfHole[]>(backupKey);
  if (!backup?.length) return null;
  // Mem-only hydrate so paint is instant; session stays reserved for OSM OK.
  memSet(requestKey, backup);
  touchBackupIndex(backupKey);
  return { holes: backup, fromBackup: true };
}

function saveHolesBackup(backupKey: string, requestKey: string, holes: GolfHole[]): void {
  if (!holes.length) return;
  memSet(requestKey, holes);
  sessionSet(requestKey, holes);
  localSet(backupKey, holes);
  touchBackupIndex(backupKey);
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
      await new Promise((r) => setTimeout(r, 350 * i));
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
    : new Error('Course map request failed');
}

export async function fetchGolfCourses(
  lat: number,
  lon: number,
  opts?: { q?: string; radius?: number; signal?: AbortSignal },
): Promise<GolfCourseSummary[]> {
  const q = opts?.q?.trim().toLowerCase() ?? '';
  const key = coursesCacheKey(lat, lon, q, opts?.radius);
  const cached = peekGolfCoursesCache(lat, lon, opts?.q, opts?.radius);
  if (cached) {
    memSet(key, cached);
    return cached;
  }

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    v: '4',
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
    const stale = localGetAllowStale<GolfCourseSummary[]>(key);
    return stale?.length ? stale : [];
  }
  if (!res.ok) {
    if (res.status >= 500) {
      const stale = localGetAllowStale<GolfCourseSummary[]>(key);
      return stale?.length ? stale : [];
    }
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? `courses ${res.status}`);
  }
  const data = (await res.json()) as { courses: GolfCourseSummary[] };
  const courses = (data.courses ?? [])
    .map((c) => ({
      ...c,
      kind: c.kind ?? venueKindFromName(c.name),
      photo: c.photo ?? courseHeroImage(c.id || c.name),
    }))
    .filter((c) => isPlayableCourse(c.kind));
  memSet(key, courses);
  sessionSet(key, courses);
  localSet(key, courses);
  return courses;
}

export type GolfHolesLoadResult = {
  holes: GolfHole[];
  /** True when OSM failed/empty and a durable course-map backup was used. */
  fromBackup: boolean;
};

export async function fetchGolfHoles(
  lat: number,
  lon: number,
  opts?: HolesFetchOpts,
): Promise<GolfHole[]> {
  const result = await loadGolfHoles(lat, lon, opts);
  return result.holes;
}

function keepBackupHot(
  backupKey: string,
  requestKey: string,
  holes: GolfHole[],
): void {
  if (!holes.length) return;
  memSet(requestKey, holes);
  touchBackupIndex(backupKey);
}

export async function loadGolfHoles(
  lat: number,
  lon: number,
  opts?: HolesFetchOpts,
): Promise<GolfHolesLoadResult> {
  const { requestKey, backupKey, bbox } = holesRequestKey(lat, lon, opts);
  const peeked = peekGolfHolesDetail(lat, lon, opts);
  // OSM-confirmed session cache — skip the network entirely.
  if (peeked?.holes.length && !peeked.fromBackup) {
    return { holes: peeked.holes, fromBackup: false };
  }
  const backup = peeked?.holes?.length ? peeked.holes : null;

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    v: '10',
  });
  if (opts?.radius) params.set('radius', String(opts.radius));
  params.set('bbox', bbox.map((n) => q4(n)).join(','));
  if (opts?.osmType && opts.osmId != null && Number(opts.osmId) > 0) {
    params.set('osmType', opts.osmType);
    params.set('osmId', String(opts.osmId));
  }
  if (opts?.courseName) params.set('courseName', opts.courseName);

  // When a backup exists, soft-refresh OSM with a short deadline so the map
  // never waits on a slow/overloaded Overpass mirror.
  const softRefresh = Boolean(backup?.length);
  const radii = softRefresh
    ? [opts?.radius ?? 1800]
    : opts?.bbox
      ? [opts.radius ?? 1800]
      : [opts?.radius ?? 1800, 2800];
  const attempts = softRefresh ? 1 : 2;

  let lastErr: unknown = null;
  for (const radius of radii) {
    if (opts?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    params.set('radius', String(radius));

    const softAc = softRefresh ? new AbortController() : null;
    const softTimer = softAc
      ? window.setTimeout(() => softAc.abort(), HOLES_SOFT_REFRESH_MS)
      : 0;
    const onParentAbort = () => softAc?.abort();
    if (softAc && opts?.signal) {
      if (opts.signal.aborted) softAc.abort();
      else opts.signal.addEventListener('abort', onParentAbort, { once: true });
    }
    const signal = softAc?.signal ?? opts?.signal;

    try {
      const res = await fetchWithRetry(
        `/api/golf/holes?${params}`,
        signal,
        attempts,
      );
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        lastErr = new Error(detail?.error ?? `holes ${res.status}`);
        if (softRefresh && backup) break;
        continue;
      }
      const data = (await res.json()) as { holes: GolfHole[] };
      const holes = data.holes ?? [];
      if (holes.length) {
        saveHolesBackup(backupKey, requestKey, holes);
        return { holes, fromBackup: false };
      }
      if (backup?.length) {
        keepBackupHot(backupKey, requestKey, backup);
        return { holes: backup, fromBackup: true };
      }
      return { holes: [], fromBackup: false };
    } catch (err) {
      if (opts?.signal?.aborted) throw err;
      lastErr = err;
      if (softRefresh && backup) break;
      await new Promise((r) => setTimeout(r, 700));
    } finally {
      if (softTimer) window.clearTimeout(softTimer);
      opts?.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  if (backup?.length) {
    keepBackupHot(backupKey, requestKey, backup);
    return { holes: backup, fromBackup: true };
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error('Failed to load hole maps');
}

const warmInFlight = new Set<string>();

/** Idle-prefetch nearby course maps so OSM outages still open instantly. */
export function warmNearbyCourseMaps(
  courses: GolfCourseSummary[],
  limit = 12,
): void {
  if (typeof window === 'undefined') return;
  const targets = courses
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon))
    .slice(0, limit);

  const run = () => {
    for (const course of targets) {
      const id = course.id || `${course.osmType}:${course.osmId}`;
      warmSatelliteTiles(course.lat, course.lon, { courseId: id });
      const peek = peekGolfHolesDetail(course.lat, course.lon, {
        bbox: course.bbox,
        osmType: course.osmType,
        osmId: course.osmId,
        courseName: course.name,
      });
      // Skip only OSM-confirmed session hits; still refresh durable backups.
      if (peek?.holes.length && !peek.fromBackup) continue;
      if (warmInFlight.has(id)) continue;
      warmInFlight.add(id);
      void fetchGolfHoles(course.lat, course.lon, {
        bbox: course.bbox,
        osmType: course.osmType,
        osmId: course.osmId,
        courseName: course.name,
      })
        .catch(() => {
          // Warm is best-effort.
        })
        .finally(() => {
          warmInFlight.delete(id);
        });
    }
  };

  const ric = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }
  ).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(run, { timeout: 4000 });
  } else {
    window.setTimeout(run, 1200);
  }
}

export interface GolfNotebookDay {
  date: string;
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  agreement: number | null;
  confidence?: 'full' | 'low' | 'single-source';
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

/** Esri World Imagery — dual hosts for more parallel tile downloads. */
export const GOLF_SATELLITE_STYLE = {
  version: 8 as const,
  name: 'Golf Satellite',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    esri: {
      type: 'raster' as const,
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
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
      paint: {
        'raster-fade-duration': 0,
      },
    },
  ],
};
