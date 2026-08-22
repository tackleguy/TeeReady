/**
 * GPS shot tracking for a live round.
 *
 * Each shot records where it was hit from and where it landed.
 * Shots are grouped by hole number and persisted to localStorage.
 */

import { haversineYards } from './golfMeasure';
import type { BagClub } from './golfProfile';
import { logRoundStart } from './roundLog';

export interface TrackedShot {
  id: string;
  holeNumber: number;
  shotNumber: number;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  club?: string;
  yards: number;
  /** Distance remaining to the green after this shot. */
  remainYards: number;
  ts: number;
}

export interface HoleScore {
  holeNumber: number;
  par: number;
  strokes: number;
  putts: number;
  /** Par 4/5 only — true hit, false missed. */
  fairwayHit?: boolean | null;
  /** Reached green in regulation. */
  gir?: boolean | null;
  chips?: number;
  penalties?: number;
  /** null = no sand on hole. */
  sandSave?: boolean | null;
}

export type HoleStatExtras = Partial<
  Pick<HoleScore, 'fairwayHit' | 'gir' | 'chips' | 'penalties' | 'sandSave'>
>;

export interface TrackedRound {
  id: string;
  courseId: string;
  courseName: string;
  loop?: string;
  startedAt: number;
  shots: TrackedShot[];
  scores: HoleScore[];
}

const STORAGE_KEY = 'teeready-golf-round-v1';

export function newRound(
  courseId: string,
  courseName: string,
  loop?: string,
): TrackedRound {
  const round: TrackedRound = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    courseId,
    courseName,
    loop,
    startedAt: Date.now(),
    shots: [],
    scores: [],
  };
  logRoundStart(courseName);
  return round;
}

export function addShot(
  round: TrackedRound,
  holeNumber: number,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  green: { lat: number; lon: number },
  club?: string,
): TrackedRound {
  const existing = round.shots.filter((s) => s.holeNumber === holeNumber);
  const shot: TrackedShot = {
    id: `${holeNumber}-${existing.length + 1}-${Date.now()}`,
    holeNumber,
    shotNumber: existing.length + 1,
    from,
    to,
    club,
    yards: Math.round(haversineYards(from.lat, from.lon, to.lat, to.lon)),
    remainYards: Math.round(
      haversineYards(to.lat, to.lon, green.lat, green.lon),
    ),
    ts: Date.now(),
  };
  return { ...round, shots: [...round.shots, shot] };
}

export function undoLastShot(round: TrackedRound): TrackedRound {
  if (!round.shots.length) return round;
  return { ...round, shots: round.shots.slice(0, -1) };
}

export function shotsForHole(
  round: TrackedRound,
  holeNumber: number,
): TrackedShot[] {
  return round.shots.filter((s) => s.holeNumber === holeNumber);
}

function statField<K extends keyof HoleStatExtras>(
  extras: HoleStatExtras | undefined,
  key: K,
  prev: HoleScore[K] | undefined,
): HoleScore[K] | undefined {
  if (extras && key in extras) return extras[key] as HoleScore[K] | undefined;
  return prev;
}

export function setHoleScore(
  round: TrackedRound,
  holeNumber: number,
  par: number,
  strokes: number,
  putts: number,
  extras?: HoleStatExtras,
): TrackedRound {
  const prev = round.scores.find((s) => s.holeNumber === holeNumber);
  const scores = round.scores.filter((s) => s.holeNumber !== holeNumber);
  scores.push({
    holeNumber,
    par,
    strokes,
    putts,
    fairwayHit: statField(extras, 'fairwayHit', prev?.fairwayHit),
    gir: statField(extras, 'gir', prev?.gir),
    chips: statField(extras, 'chips', prev?.chips),
    penalties: statField(extras, 'penalties', prev?.penalties),
    sandSave: statField(extras, 'sandSave', prev?.sandSave),
  });
  return { ...round, scores };
}

export function setHoleStats(
  round: TrackedRound,
  holeNumber: number,
  extras: HoleStatExtras,
): TrackedRound {
  const prev = round.scores.find((s) => s.holeNumber === holeNumber);
  if (!prev) return round;
  return setHoleScore(
    round,
    holeNumber,
    prev.par,
    prev.strokes,
    prev.putts,
    extras,
  );
}

export function roundTotalStrokes(round: TrackedRound): number {
  return round.scores.reduce((sum, s) => sum + s.strokes, 0);
}

export function roundTotalPar(round: TrackedRound): number {
  return round.scores.reduce((sum, s) => sum + s.par, 0);
}

export function roundScoreLabel(round: TrackedRound): string {
  const strokes = roundTotalStrokes(round);
  const par = roundTotalPar(round);
  if (!round.scores.length) return '–';
  const diff = strokes - par;
  if (diff === 0) return `E (${strokes})`;
  return `${diff > 0 ? '+' : ''}${diff} (${strokes})`;
}

export function getHoleScore(
  round: TrackedRound,
  holeNumber: number,
): HoleScore | undefined {
  return round.scores.find((s) => s.holeNumber === holeNumber);
}

export function bestClubForDistance(
  yards: number,
  bag: BagClub[],
): string | undefined {
  if (!bag.length) return undefined;
  const best = bag.reduce((b, c) =>
    Math.abs(c.yards - yards) < Math.abs(b.yards - yards) ? c : b,
  );
  return best.label;
}

/** GeoJSON for shot trace lines on the map. */
export function shotTracesGeoJSON(
  shots: TrackedShot[],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shots.map((s) => ({
      type: 'Feature' as const,
      properties: {
        shotId: s.id,
        club: s.club ?? '',
        yards: s.yards,
        shotNumber: s.shotNumber,
      },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [s.from.lon, s.from.lat],
          [s.to.lon, s.to.lat],
        ],
      },
    })),
  };
}

/** GeoJSON for shot landing points on the map. */
export function shotPointsGeoJSON(
  shots: TrackedShot[],
): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: shots.map((s) => ({
      type: 'Feature' as const,
      properties: {
        shotId: s.id,
        club: s.club ?? '',
        yards: s.yards,
        shotNumber: s.shotNumber,
        label: `${s.shotNumber}`,
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [s.to.lon, s.to.lat],
      },
    })),
  };
}

// ─── Persistence ───

export function saveRound(round: TrackedRound): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(round));
  } catch {
    // Storage full or unavailable — round still works in memory.
  }
  try {
    window.dispatchEvent(
      new CustomEvent('teeready-round-changed', { detail: round }),
    );
  } catch {
    // ignore
  }
}

export function loadRound(): TrackedRound | null {
  try {
    // Intentionally do not migrate legacy `golf-round-v1` — that key is
    // shared with WeatherStop and often leaves a sticky wrong course
    // (e.g. Liberty National) on the scorecard.
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrackedRound;
    if (!parsed.id || !parsed.courseId || !Array.isArray(parsed.shots)) {
      return null;
    }
    if (!Array.isArray(parsed.scores)) parsed.scores = [];
    return parsed;
  } catch {
    return null;
  }
}

export function clearRound(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
  try {
    window.dispatchEvent(
      new CustomEvent('teeready-round-changed', { detail: null }),
    );
  } catch {
    // ignore
  }
}

/** True when a tracked round is stored (for nav / keep-alive). */
export function hasStoredRound(): boolean {
  return loadRound() != null;
}
