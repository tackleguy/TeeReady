/**
 * Club database — turns range shots into per-club distance knowledge.
 *
 * This is the piece that closes the loop: practice → measure → the GPS caddie
 * knows how far you actually hit it.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE:
 * Aggregation reduces noise. It does not reduce bias. Averaging fifty
 * `uncalibrated` shots gives an `uncalibrated` average — a systematically wrong
 * measurement repeated fifty times is still wrong, just wrong with a tighter
 * standard deviation. Sample size and measurement calibration are two different
 * axes and are tracked separately below. Never collapse them.
 */

import type { LaunchAnalysis, LaunchConfidence } from '../launch/types';

/** How much data we have. Independent of whether the data is calibrated. */
export type ClubSampleQuality = 'insufficient' | 'provisional' | 'established';

/** Where a shot's numbers came from. */
export type ShotSource = 'measured' | 'manual';

/** Below this, the caddie must stay silent. */
export const MIN_SHOTS_FOR_ADVICE = 10;
const ESTABLISHED_SHOTS = 25;

/** Robust outlier cutoff, in median-absolute-deviations. */
const OUTLIER_MAD_LIMIT = 3;

/** Normalised shot — the one shape the database accepts. */
export type ClubShot = {
  id: string;
  club: string;
  createdAt: number;
  source: ShotSource;
  /** The only field that is always present. */
  carryYd: number;
  totalYd: number | null;
  /** Lateral offset from target line, yards. Positive = right. */
  lateralYd: number | null;
  ballSpeedMph: number | null;
  clubSpeedMph: number | null;
  launchDeg: number | null;
  /** Inherited from the measurement. Manual entries are self-reported. */
  confidence: LaunchConfidence | 'self-reported';
};

export type ClubStats = {
  club: string;
  shotCount: number;
  excludedCount: number;
  avgCarryYd: number;
  /** ~1σ band. This — not the mean — is what should drive club choice. */
  carryRangeYd: [number, number];
  bestCarryYd: number;
  avgLateralYd: number | null;
  dispersionYd: number | null;
  avgBallSpeedMph: number | null;
  avgClubSpeedMph: number | null;
  avgLaunchDeg: number | null;
  /** Worst confidence among contributing shots. Never upgraded by volume. */
  confidence: LaunchConfidence | 'self-reported' | 'mixed';
  sampleQuality: ClubSampleQuality;
  /** True only when the numbers are safe to give advice from. */
  usableForAdvice: boolean;
  updatedAt: number;
};

export type ClubAggregate = {
  stats: ClubStats;
  /** Surfaced to the user so exclusions are never silent. */
  excluded: ClubShot[];
};

// ── adapters ────────────────────────────────────────────────────────────────

function metric(a: LaunchAnalysis, id: string): number | null {
  const m = a.metrics.find((x) => x.id === id);
  return m && Number.isFinite(m.value) ? m.value : null;
}

/**
 * Build a shot from a launch analysis. Returns null when carry is unavailable —
 * a shot with no carry teaches the database nothing, and inventing one from
 * ball speed alone would be exactly the fabrication we refuse elsewhere.
 */
export function shotFromLaunch(a: LaunchAnalysis, club: string): ClubShot | null {
  const carry = metric(a, 'carry');
  if (carry == null) return null;
  return {
    id: a.id,
    club,
    createdAt: a.createdAt,
    source: 'measured',
    carryYd: carry,
    totalYd: metric(a, 'total'),
    lateralYd: metric(a, 'lateral'),
    ballSpeedMph: metric(a, 'ballSpeed'),
    clubSpeedMph: metric(a, 'clubSpeed'),
    launchDeg: metric(a, 'launchAngle'),
    confidence: 'uncalibrated',
  };
}

/** Manual entry — the range works with no camera at all. */
export function manualShot(
  club: string,
  carryYd: number,
  opts: { id: string; lateralYd?: number | null; createdAt?: number } ,
): ClubShot {
  return {
    id: opts.id,
    club,
    createdAt: opts.createdAt ?? Date.now(),
    source: 'manual',
    carryYd,
    totalYd: null,
    lateralYd: opts.lateralYd ?? null,
    ballSpeedMph: null,
    clubSpeedMph: null,
    launchDeg: null,
    confidence: 'self-reported',
  };
}

// ── math ────────────────────────────────────────────────────────────────────

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function compact(xs: Array<number | null>): number[] {
  return xs.filter((x): x is number => x != null && Number.isFinite(x));
}

/**
 * Median-absolute-deviation outlier split. Chosen over standard deviation
 * because a shank is exactly the kind of extreme value that inflates σ and then
 * hides inside the widened band it created.
 */
function splitOutliers(shots: ClubShot[]): { kept: ClubShot[]; excluded: ClubShot[] } {
  if (shots.length < 5) return { kept: shots, excluded: [] };
  const carries = shots.map((s) => s.carryYd);
  const med = median(carries);
  const mad = median(carries.map((c) => Math.abs(c - med)));
  if (mad === 0) return { kept: shots, excluded: [] };
  const kept: ClubShot[] = [];
  const excluded: ClubShot[] = [];
  for (const s of shots) {
    (Math.abs(s.carryYd - med) / mad > OUTLIER_MAD_LIMIT ? excluded : kept).push(s);
  }
  return { kept, excluded };
}

function rollUpConfidence(shots: ClubShot[]): ClubStats['confidence'] {
  const set = new Set(shots.map((s) => s.confidence));
  if (set.size === 0) return 'self-reported';
  if (set.size > 1) return 'mixed';
  return [...set][0];
}

function sampleQuality(n: number): ClubSampleQuality {
  if (n < MIN_SHOTS_FOR_ADVICE) return 'insufficient';
  if (n < ESTABLISHED_SHOTS) return 'provisional';
  return 'established';
}

// ── aggregation ─────────────────────────────────────────────────────────────

export function aggregateClub(club: string, allShots: ClubShot[]): ClubAggregate | null {
  const shots = allShots.filter((s) => s.club === club && Number.isFinite(s.carryYd));
  if (!shots.length) return null;

  const { kept, excluded } = splitOutliers(shots);
  const carries = kept.map((s) => s.carryYd);
  const avgCarry = mean(carries);
  const sd = stdev(carries);
  const laterals = compact(kept.map((s) => s.lateralYd));
  const quality = sampleQuality(kept.length);

  return {
    excluded,
    stats: {
      club,
      shotCount: kept.length,
      excludedCount: excluded.length,
      avgCarryYd: Math.round(avgCarry),
      carryRangeYd: [Math.round(avgCarry - sd), Math.round(avgCarry + sd)],
      bestCarryYd: Math.round(Math.max(...carries)),
      avgLateralYd: laterals.length ? Math.round(mean(laterals)) : null,
      dispersionYd: laterals.length > 1 ? Math.round(stdev(laterals) * 2) : null,
      avgBallSpeedMph: avg(kept, 'ballSpeedMph'),
      avgClubSpeedMph: avg(kept, 'clubSpeedMph'),
      avgLaunchDeg: avg(kept, 'launchDeg'),
      confidence: rollUpConfidence(kept),
      sampleQuality: quality,
      usableForAdvice: quality !== 'insufficient',
      updatedAt: Date.now(),
    },
  };
}

function avg(shots: ClubShot[], key: keyof ClubShot): number | null {
  const xs = compact(shots.map((s) => s[key] as number | null));
  return xs.length ? Math.round(mean(xs) * 10) / 10 : null;
}

export function aggregateAll(shots: ClubShot[]): ClubStats[] {
  const clubs = [...new Set(shots.map((s) => s.club))];
  return clubs
    .map((c) => aggregateClub(c, shots)?.stats)
    .filter((s): s is ClubStats => Boolean(s))
    .sort((a, b) => b.avgCarryYd - a.avgCarryYd);
}

// ── what the launch monitor and the caddie consume ──────────────────────────

/**
 * The comparison line the launch monitor shows after a shot:
 * "7 yards farther than your average."
 *
 * Returns null when there isn't enough history — a comparison against three
 * previous swings is noise dressed up as insight.
 */
export function compareToAverage(
  shot: ClubShot,
  stats: ClubStats | null,
): { deltaYd: number; text: string } | null {
  if (!stats || !stats.usableForAdvice) return null;
  const delta = Math.round(shot.carryYd - stats.avgCarryYd);
  if (delta === 0) return { deltaYd: 0, text: `Right on your ${stats.club} average.` };
  const dir = delta > 0 ? 'farther than' : 'shorter than';
  return {
    deltaYd: delta,
    text: `${Math.abs(delta)} yards ${dir} your ${stats.club} average of ${stats.avgCarryYd}, across ${stats.shotCount} shots.`,
  };
}

export type CaddieAdvice = {
  club: string;
  reason: string;
  /** Always present. The caveat travels with the advice, never separately. */
  caveat: string;
};

/**
 * Club recommendation for a carry distance, e.g. to a hazard.
 *
 * Deliberately conservative: it recommends off the TOP of the carry range, not
 * the mean, when a hazard is in play. A golfer who hears "you carry 224" will
 * treat 224 as reliable; half their shots go farther than the mean by
 * definition, and that half is the half that finds the bunker.
 */
export function clubForCarry(
  targetYd: number,
  hazardStartsYd: number | null,
  all: ClubStats[],
): CaddieAdvice | null {
  const usable = all.filter((s) => s.usableForAdvice);
  if (!usable.length) return null;

  const safe = usable.filter((s) =>
    hazardStartsYd == null ? true : s.carryRangeYd[1] < hazardStartsYd,
  );
  const pool = safe.length ? safe : usable;

  const best = pool.reduce((a, b) =>
    Math.abs(b.avgCarryYd - targetYd) < Math.abs(a.avgCarryYd - targetYd) ? b : a,
  );

  const reason =
    hazardStartsYd != null && safe.length && safe[0] !== usable[0]
      ? `${best.club} carries ${best.avgCarryYd} (${best.carryRangeYd[0]}–${best.carryRangeYd[1]}) and stays short of the trouble at ${hazardStartsYd}.`
      : `${best.club} carries ${best.avgCarryYd} (${best.carryRangeYd[0]}–${best.carryRangeYd[1]}) — closest to ${targetYd}.`;

  const caveat =
    best.confidence === 'self-reported'
      ? `Based on distances you entered yourself, across ${best.shotCount} shots.`
      : `Measured from ${best.shotCount} shots with a phone camera — not launch-monitor accurate.`;

  return { club: best.club, reason, caveat };
}
