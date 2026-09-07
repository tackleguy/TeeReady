/** Round prep checklist — hole-by-hole strategy from ensemble + profile. */

import type { GolfHole, HoleBrief, TurfReport } from './golf';
import type { HoleForecast } from './golfPredict';
import type { GolfPlayerProfile, MissBias } from './golfProfile';
import { missLabel } from './golfProfile';

export type PrepFocus =
  | 'tee-shot'
  | 'approach'
  | 'short-game'
  | 'wind'
  | 'firm-turf'
  | 'elevation';

export type PrepHolePlan = {
  holeNumber: number;
  par: number | null;
  yards: number;
  playsLikeYards: number | null;
  playsLikeDelta: number | null;
  club: string | null;
  windMph: number | null;
  aspect: string | null;
  focus: PrepFocus;
  focusLabel: string;
  tip: string;
  checked?: boolean;
};

export type RoundPrepPlan = {
  courseName: string;
  holeCount: number;
  avgWindMph: number | null;
  turfLine: string | null;
  missPlan: string;
  keys: string[];
  holes: PrepHolePlan[];
  builtAt: string;
};

function focusForHole(input: {
  par: number | null;
  yards: number;
  brief: HoleBrief | null | undefined;
  turf: TurfReport | null | undefined;
  miss: MissBias;
}): { focus: PrepFocus; focusLabel: string; tip: string } {
  const { par, yards, brief, turf, miss } = input;
  const wind = brief?.windMph ?? 0;
  const elev = Math.abs(brief?.elevationChangeFt ?? 0);
  const delta =
    brief != null ? brief.playsLikeYards - brief.yards : 0;

  if (wind >= 14 || Math.abs(brief?.crosswindMph ?? 0) >= 10) {
    return {
      focus: 'wind',
      focusLabel: 'Wind hole',
      tip: `Commit to a start line that leaves room for your ${missLabel(miss).toLowerCase()} — don't fight the gust mid-swing.`,
    };
  }
  if ((turf?.fairway === 'firm' || turf?.green === 'firm') && yards >= 350) {
    return {
      focus: 'firm-turf',
      focusLabel: 'Firm turf',
      tip: 'Land short of trouble and use the bounce — club up and flight it lower if needed.',
    };
  }
  if (elev >= 25) {
    return {
      focus: 'elevation',
      focusLabel: 'Elevation',
      tip:
        (brief?.elevationChangeFt ?? 0) > 0
          ? 'Uphill — trust the plays-like number and take enough club.'
          : 'Downhill — dial back and keep the ball flight controlled.',
    };
  }
  if (par === 3 || yards <= 200) {
    return {
      focus: 'short-game',
      focusLabel: 'Target hole',
      tip: 'Pick the fat side of the green for your miss and commit to one number.',
    };
  }
  if (par === 5 || yards >= 500) {
    return {
      focus: 'tee-shot',
      focusLabel: 'Tee shot',
      tip: 'Position first — leave your preferred approach distance, not max carry.',
    };
  }
  if (Math.abs(delta) >= 8) {
    return {
      focus: 'approach',
      focusLabel: 'Plays-like',
      tip: `Card is ${yards} but it plays ${brief!.playsLikeYards} — use the adjusted number for the approach.`,
    };
  }
  return {
    focus: 'approach',
    focusLabel: 'Approach',
    tip: `Bias the target away from your ${missLabel(miss).toLowerCase()} and take the middle of the green when unsure.`,
  };
}

export function buildRoundPrepPlan(input: {
  courseName: string;
  holes: GolfHole[];
  briefs: Map<number, HoleBrief>;
  forecasts?: Map<number, HoleForecast> | null;
  turf: TurfReport | null | undefined;
  profile: GolfPlayerProfile;
}): RoundPrepPlan {
  const { courseName, holes, briefs, turf, profile } = input;
  const plans: PrepHolePlan[] = holes.map((h) => {
    const brief = briefs.get(h.number);
    const { focus, focusLabel, tip } = focusForHole({
      par: h.par ?? null,
      yards: h.yards,
      brief,
      turf,
      miss: profile.miss,
    });
    const playsLike = brief?.playsLikeYards ?? null;
    return {
      holeNumber: h.number,
      par: h.par ?? null,
      yards: h.yards,
      playsLikeYards: playsLike,
      playsLikeDelta:
        playsLike != null ? playsLike - h.yards : null,
      club: brief?.recommendedClub ?? brief?.clubHint ?? null,
      windMph: brief != null ? Math.round(brief.windMph) : null,
      aspect: brief?.aspect ?? null,
      focus,
      focusLabel,
      tip,
    };
  });

  const winds = plans
    .map((p) => p.windMph)
    .filter((n): n is number => n != null);
  const avgWindMph =
    winds.length > 0
      ? Math.round(winds.reduce((a, b) => a + b, 0) / winds.length)
      : null;

  const keys: string[] = [];
  const windHoles = plans.filter((p) => p.focus === 'wind').length;
  if (windHoles >= 3) {
    keys.push(`${windHoles} wind holes — favor flighted shots and conservative targets.`);
  }
  if (turf?.fairway === 'firm' || turf?.green === 'firm') {
    keys.push('Firm turf today — land short and let it release.');
  } else if (turf?.fairway === 'soft' || turf?.green === 'soft') {
    keys.push('Soft turf — take enough club; expect little roll.');
  }
  if (profile.miss !== 'straight') {
    keys.push(`Your miss is ${missLabel(profile.miss).toLowerCase()} — leave that side open on every approach.`);
  }
  const bigPlays = plans.filter(
    (p) => p.playsLikeDelta != null && Math.abs(p.playsLikeDelta) >= 12,
  ).length;
  if (bigPlays >= 2) {
    keys.push(`${bigPlays} holes play ≥12 yd off card — trust plays-like over the scorecard.`);
  }
  if (!keys.length) {
    keys.push('Stay patient — hit your stock shape and take middle-of-green when unsure.');
  }

  return {
    courseName,
    holeCount: holes.length,
    avgWindMph,
    turfLine:
      turf != null
        ? `Fairways ${turf.fairway}, greens ${turf.green}`
        : null,
    missPlan: missLabel(profile.miss),
    keys,
    holes: plans,
    builtAt: new Date().toISOString(),
  };
}
