// Client types + fetchers for the Golf section.
// Memory + sessionStorage cache so reopening a course / city is instant.

import type { GolfPlayerProfile } from './golfProfile';
import { isPlayableCourse, venueKindFromName } from './venueKind';
import { courseHeroImage } from './courseImages';
import { warmSatelliteTiles } from './golfSatelliteCache';
import { resolveAndWarmGreenMesh } from './golfGreen3d';
import { resolveHolePack, resolveAndWarmHolePack } from './golfHolePacks';
import { resolveAndWarmScorecardPack } from './golfScorecardPacks';
import { standardizeLayouts } from './golfHolesNormalize';
import { annotateHolesGeo } from './geoAccuracy';

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

import type { ScorecardProvenance } from './scorecardProvenance';
import type { GeoAccuracyMeta } from './geoAccuracy';

export type { ScorecardProvenance };
export type { GeoAccuracyMeta, GeoConfidence } from './geoAccuracy';

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
  /** Where pars/yardages for this course came from. */
  provenance?: ScorecardProvenance;
  /** Geographic confidence — never implied by a guessed tee. */
  geo?: GeoAccuracyMeta;
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
const HOLES_BACKUP_MAX = 64;
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
    `golf:v13:holes:${q4(lat)}:${q4(lon)}:${bboxKey}:` +
    `${opts?.radius ?? ''}:${courseKey}`;
  const backupKey =
    opts?.osmType && opts?.osmId
      ? `golf:v2:hole-backup:${opts.osmType}:${opts.osmId}`
      : `golf:v2:hole-backup:geo:${q3(lat)}:${q3(lon)}:${opts?.courseName?.trim().toLowerCase() ?? ''}`;
  return { requestKey, backupKey, bbox };
}

function coursesCacheKey(
  lat: number,
  lon: number,
  q: string,
  radius?: number,
): string {
  return `golf:v9:courses:${q3(lat)}:${q3(lon)}:${q}:${radius ?? ''}`;
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
  if (live?.length) return cleanCourseList(live);
  // Never wipe expired lists — stale courses still beat an empty OSM outage.
  const local = localGetAllowStale<GolfCourseSummary[]>(key);
  if (local?.length) {
    const cleaned = cleanCourseList(local);
    memSet(key, cleaned);
    sessionSet(key, cleaned);
    return cleaned;
  }
  return null;
}

export type GolfHolesLoadResult = {
  holes: GolfHole[];
  /** True when OSM failed/empty and a durable course-map backup was used. */
  fromBackup: boolean;
  /** True when geometry came from a static /golf/holes pack. */
  fromPack?: boolean;
};

type HolesFetchOpts = {
  radius?: number;
  bbox?: [number, number, number, number];
  osmType?: string;
  osmId?: number;
  courseName?: string;
  signal?: AbortSignal;
  /**
   * Fired as soon as a pack or durable backup is ready so Prep/GPS can paint
   * hole lines without waiting on Overpass soft-refresh.
   */
  onAvailable?: (result: GolfHolesLoadResult) => void;
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
  opts?: Omit<HolesFetchOpts, 'signal' | 'onAvailable'>,
): GolfHole[] | null {
  return peekGolfHolesDetail(lat, lon, opts)?.holes ?? null;
}

/** Same as peekGolfHolesCache, with whether the hit was a durable backup. */
export function peekGolfHolesDetail(
  lat: number,
  lon: number,
  opts?: Omit<HolesFetchOpts, 'signal' | 'onAvailable'>,
): GolfHolesPeek | null {
  const { requestKey, backupKey } = holesRequestKey(lat, lon, opts);
  // Session = OSM-confirmed this tab — instant reopen, no soft-refresh needed.
  const confirmed = sessionGet<GolfHole[]>(requestKey, HOLES_TTL_MS);
  if (confirmed?.length) {
    const holes = cleanHoles(confirmed);
    memSet(requestKey, holes);
    return { holes, fromBackup: false };
  }
  const mem = memGet<GolfHole[]>(requestKey, HOLES_TTL_MS);
  if (mem?.length) {
    // Mem-only hits are usually a just-painted backup; treat as backup so load
    // still soft-refreshes OSM instead of skipping the network forever.
    return { holes: cleanHoles(mem), fromBackup: true };
  }
  // Never delete backups on read — expired maps are the OSM-outage lifeline.
  const backup = localGetAllowStale<GolfHole[]>(backupKey);
  if (!backup?.length) return null;
  const holes = cleanHoles(backup);
  // Mem-only hydrate so paint is instant; session stays reserved for OSM OK.
  memSet(requestKey, holes);
  touchBackupIndex(backupKey);
  return { holes, fromBackup: true };
}

/** Live OSM confirm — session hit skips soft-refresh on reopen. */
function saveHolesBackup(backupKey: string, requestKey: string, holes: GolfHole[]): void {
  if (!holes.length) return;
  const cleaned = cleanHoles(holes);
  if (!cleaned.length) return;
  memSet(requestKey, cleaned);
  sessionSet(requestKey, cleaned);
  localSet(backupKey, cleaned);
  touchBackupIndex(backupKey);
}

/**
 * Pack / durable hydrate without session confirm so a soft-refresh can still
 * upgrade geometry when Overpass is healthy.
 */
function hydrateDurableBackup(
  backupKey: string,
  requestKey: string,
  holes: GolfHole[],
): GolfHole[] {
  if (!holes.length) return [];
  const cleaned = cleanHoles(holes);
  if (!cleaned.length) return [];
  memSet(requestKey, cleaned);
  localSet(backupKey, cleaned);
  touchBackupIndex(backupKey);
  return cleaned;
}

function cleanHoles(holes: GolfHole[]): GolfHole[] {
  return annotateHolesGeo(standardizeLayouts(holes));
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
    v: '6',
  });
  if (q) params.set('q', q);
  if (opts?.radius) params.set('radius', String(opts.radius));

  // Hard client deadline — never spin 30–60s on a stuck Edge/Overpass path.
  const deadlineAc = new AbortController();
  const deadlineTimer = window.setTimeout(() => deadlineAc.abort(), 4_000);
  const onParentAbort = () => deadlineAc.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) deadlineAc.abort();
    else opts.signal.addEventListener('abort', onParentAbort, { once: true });
  }

  let res: Response;
  try {
    res = await fetchWithRetry(
      `/api/golf/courses?${params}`,
      deadlineAc.signal,
      1,
    );
  } catch {
    const stale = localGetAllowStale<GolfCourseSummary[]>(key);
    return stale?.length ? cleanCourseList(stale) : [];
  } finally {
    window.clearTimeout(deadlineTimer);
    opts?.signal?.removeEventListener('abort', onParentAbort);
  }
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) {
      const stale = localGetAllowStale<GolfCourseSummary[]>(key);
      return stale?.length ? cleanCourseList(stale) : [];
    }
    const detail = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(detail?.error ?? `courses ${res.status}`);
  }
  const data = (await res.json()) as { courses: GolfCourseSummary[] };
  const courses = cleanCourseList(
    (data.courses ?? []).map((c) => ({
      ...c,
      kind: c.kind ?? venueKindFromName(c.name),
      photo: c.photo ?? courseHeroImage(c.id || c.name),
    })),
  );
  memSet(key, courses);
  sessionSet(key, courses);
  localSet(key, courses);
  return courses;
}

function cleanCourseList(courses: GolfCourseSummary[]): GolfCourseSummary[] {
  const playable = courses.filter((c) => {
    const kind = c.kind ?? venueKindFromName(c.name);
    if (!isPlayableCourse(kind)) return false;
    if (c.holes != null && c.holes !== 9 && c.holes !== 18) return false;
    return true;
  });
  const out: GolfCourseSummary[] = [];
  const norm = (name: string) =>
    name
      .toLowerCase()
      .replace(/\b(golf|course|club|country|the|and)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  const distMi = (
    a: GolfCourseSummary,
    b: GolfCourseSummary,
  ): number => {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 3958.8;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const A =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) *
        Math.cos(toRad(b.lat)) *
        Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(A));
  };
  for (const course of playable) {
    const key = norm(course.name);
    const idx = out.findIndex(
      (other) =>
        norm(other.name) === key && distMi(course, other) < 1.2,
    );
    if (idx < 0) {
      out.push({ ...course, kind: course.kind ?? venueKindFromName(course.name) });
      continue;
    }
    const prev = out[idx]!;
    const score = (c: GolfCourseSummary) =>
      (c.holes === 9 || c.holes === 18 ? 8 : 0) +
      (c.par != null ? 4 : 0) +
      (c.region && !/united states/i.test(c.region) ? 2 : 0) +
      (c.access && c.access !== 'unknown' ? 1 : 0);
    if (score(course) > score(prev)) {
      out[idx] = {
        ...course,
        kind: course.kind ?? venueKindFromName(course.name),
      };
    }
  }
  return out;
}

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
  let backup = peeked?.holes?.length ? peeked.holes : null;
  let fromPack = false;

  // Static /golf/holes packs are the durable backup when localStorage is cold
  // (new device, private mode, or a course never opened while OSM was healthy).
  if (!backup?.length) {
    try {
      const pack = await resolveHolePack(opts?.courseName, lat, lon);
      if (pack?.holes?.length) {
        const cleaned = hydrateDurableBackup(
          backupKey,
          requestKey,
          pack.holes,
        );
        if (cleaned.length) {
          backup = cleaned;
          fromPack = true;
        }
      }
    } catch {
      // Pack miss is fine — fall through to live OSM.
    }
  }

  const backupResult = (): GolfHolesLoadResult | null => {
    if (!backup?.length) return null;
    const cleaned = cleanHoles(backup);
    keepBackupHot(backupKey, requestKey, cleaned);
    return { holes: cleaned, fromBackup: true, fromPack };
  };

  // Paint immediately from pack/localStorage — soft-refresh must not blank the map.
  const early = backupResult();
  if (early) opts?.onAvailable?.(early);

  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    v: '11',
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
  const radii = [opts?.radius ?? 1800];
  const attempts = 1;
  // Cold open must wait long enough for OSM map.json on dense clubs
  // (multi-MB downloads + shrink-retries) before declaring the course blank.
  const hardDeadlineMs = softRefresh ? HOLES_SOFT_REFRESH_MS : 14_000;

  let lastErr: unknown = null;
  for (const radius of radii) {
    if (opts?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    params.set('radius', String(radius));

    const deadlineAc = new AbortController();
    const deadlineTimer = window.setTimeout(
      () => deadlineAc.abort(),
      hardDeadlineMs,
    );
    const onParentAbort = () => deadlineAc.abort();
    if (opts?.signal) {
      if (opts.signal.aborted) deadlineAc.abort();
      else opts.signal.addEventListener('abort', onParentAbort, { once: true });
    }

    try {
      const res = await fetchWithRetry(
        `/api/golf/holes?${params}`,
        deadlineAc.signal,
        attempts,
      );
      if (!res.ok) {
        const detail = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        lastErr = new Error(detail?.error ?? `holes ${res.status}`);
        if (backup?.length) break;
        continue;
      }
      const data = (await res.json()) as { holes: GolfHole[] };
      const holes = cleanHoles(data.holes ?? []);
      if (holes.length) {
        saveHolesBackup(backupKey, requestKey, holes);
        return { holes, fromBackup: false };
      }
      if (early) return early;
      return { holes: [], fromBackup: false };
    } catch (err) {
      if (opts?.signal?.aborted) throw err;
      lastErr = err;
      if (backup?.length) break;
    } finally {
      window.clearTimeout(deadlineTimer);
      opts?.signal?.removeEventListener('abort', onParentAbort);
    }
  }

  if (early) return early;

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
    .filter((c) => c.holes == null || c.holes === 9 || c.holes === 18)
    .slice(0, limit);

  const run = () => {
    for (const course of targets) {
      const id = course.id || `${course.osmType}:${course.osmId}`;
      warmSatelliteTiles(course.lat, course.lon, { courseId: id });
      // Prefetch static packs (holes / 3D greens / scorecards) before OSM.
      void resolveAndWarmHolePack(course.name, course.lat, course.lon);
      void resolveAndWarmGreenMesh(course.name, course.lat, course.lon);
      void resolveAndWarmScorecardPack(course.name);
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
