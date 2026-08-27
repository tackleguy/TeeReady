/** Build ground-truth facts for the round caddie. */

import type { GolfHole, HoleBrief, TurfReport } from '../golf';
import type { HoleForecast } from '../golfPredict';
import type { BagClub, GolfPlayerProfile } from '../golfProfile';
import { bestClubForDistance } from '../golfTracker';
import type { CaddyContext, CaddyFacts, CaddyMode } from './types';

export function normalizeNumberToken(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 1e6) / 1e6;
  let s = String(rounded);
  if (s.includes('e') || s.includes('E')) {
    s = rounded.toFixed(6);
  }
  if (s.includes('.')) {
    s = s.replace(/\.?0+$/, '');
  }
  return s;
}

export function buildCaddyContext(input: {
  mode: CaddyMode;
  courseName: string;
  hole: GolfHole;
  profile: GolfPlayerProfile;
  bag: BagClub[];
  brief: HoleBrief | null | undefined;
  turf: TurfReport | null | undefined;
  forecast: HoleForecast | null | undefined;
  remain?: { front: number; mid: number; back: number } | null;
  ensembleSummary?: string | null;
}): CaddyContext {
  const { hole, profile, brief, turf, forecast, remain, bag } = input;
  const bagClubForRemain =
    remain != null ? bestClubForDistance(remain.mid, bag) ?? null : null;

  const facts: CaddyFacts = {
    mode: input.mode,
    courseName: input.courseName,
    holeNumber: hole.number,
    par: hole.par ?? null,
    yards: hole.yards,
    miss: profile.miss,
    handicap: profile.handicap,
    driverYards: profile.driverYards,
    sevenIronYards: profile.sevenIronYards,
    windMph: brief ? Math.round(brief.windMph) : null,
    gustMph: brief ? Math.round(brief.gustMph) : null,
    headwindMph: brief ? Math.round(brief.headwindMph) : null,
    crosswindMph: brief ? Math.round(brief.crosswindMph) : null,
    driftYards: brief ? brief.driftYards : null,
    slopeYards: brief ? brief.slopeYards : null,
    elevationChangeFt: brief ? brief.elevationChangeFt : null,
    playsLikeYards: brief ? brief.playsLikeYards : null,
    windAdjustmentYards: brief ? brief.windAdjustmentYards : null,
    aspect: brief?.aspect ?? null,
    recommendedClub: brief?.recommendedClub ?? null,
    clubHint: brief?.clubHint ?? null,
    tip: brief?.tip ?? null,
    fairway: turf?.fairway ?? null,
    green: turf?.green ?? null,
    fairwayRollYd: turf?.fairwayRollYd ?? null,
    greenReleaseYd: turf?.greenReleaseYd ?? null,
    precipIn48h: turf != null ? Math.round(turf.precipIn48h * 100) / 100 : null,
    expectedScore: forecast?.expectedScore ?? null,
    girPct: forecast != null ? Math.round(forecast.girPct * 100) : null,
    remainFrontYd: remain != null ? Math.round(remain.front) : null,
    remainMidYd: remain != null ? Math.round(remain.mid) : null,
    remainBackYd: remain != null ? Math.round(remain.back) : null,
    bagClubForRemain,
    ensembleSummary: input.ensembleSummary ?? null,
    forecastNarrative: forecast?.narrative ?? null,
  };

  return {
    facts,
    brief: brief ?? null,
    turf: turf ?? null,
    forecast: forecast ?? null,
  };
}

/** Collect every numeric token the model is allowed to use. */
export function allowedNumbersFromFacts(facts: CaddyFacts): Set<string> {
  const allowed = new Set<string>();
  const add = (n: number | null | undefined) => {
    if (n == null || !Number.isFinite(n)) return;
    const tok = normalizeNumberToken(n);
    if (tok) allowed.add(tok);
  };

  add(facts.holeNumber);
  add(facts.par);
  add(facts.yards);
  add(facts.handicap);
  add(facts.driverYards);
  add(facts.sevenIronYards);
  add(facts.windMph);
  add(facts.gustMph);
  add(facts.headwindMph);
  add(facts.crosswindMph);
  add(facts.driftYards);
  add(facts.slopeYards);
  add(facts.elevationChangeFt);
  add(facts.playsLikeYards);
  add(facts.windAdjustmentYards);
  add(facts.fairwayRollYd);
  add(facts.greenReleaseYd);
  add(facts.precipIn48h);
  add(facts.expectedScore);
  add(facts.girPct);
  add(facts.remainFrontYd);
  add(facts.remainMidYd);
  add(facts.remainBackYd);

  // Small ordinals/counts the prose may need (holes, paragraphs).
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 18]) add(n);

  return allowed;
}
