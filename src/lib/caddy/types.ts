/** Round AI caddie — Prep weather tips + GPS shot advice. */

import type { HoleBrief, TurfReport } from '../golf';
import type { HoleForecast } from '../golfPredict';
import type { MissBias } from '../golfProfile';

export type CaddyMode = 'prep' | 'gps';

export type CaddySource = 'llm' | 'rules';

/** Ground-truth snapshot the model may cite — never invent beyond this. */
export type CaddyFacts = {
  mode: CaddyMode;
  courseName: string;
  holeNumber: number;
  par: number | null;
  yards: number;
  miss: MissBias;
  handicap: number;
  driverYards: number;
  sevenIronYards: number;
  windMph: number | null;
  gustMph: number | null;
  headwindMph: number | null;
  crosswindMph: number | null;
  driftYards: number | null;
  slopeYards: number | null;
  elevationChangeFt: number | null;
  playsLikeYards: number | null;
  windAdjustmentYards: number | null;
  aspect: string | null;
  recommendedClub: string | null;
  clubHint: string | null;
  tip: string | null;
  fairway: TurfReport['fairway'] | null;
  green: TurfReport['green'] | null;
  fairwayRollYd: number | null;
  greenReleaseYd: number | null;
  precipIn48h: number | null;
  expectedScore: number | null;
  girPct: number | null;
  remainFrontYd: number | null;
  remainMidYd: number | null;
  remainBackYd: number | null;
  bagClubForRemain: string | null;
  ensembleSummary: string | null;
  forecastNarrative: string | null;
};

export type CaddyContext = {
  facts: CaddyFacts;
  brief: HoleBrief | null;
  turf: TurfReport | null;
  forecast: HoleForecast | null;
};

export type CaddyResult = {
  text: string;
  source: CaddySource;
  elapsedMs?: number;
  model?: string;
  notice?: string;
  rejectionReason?: string;
};
