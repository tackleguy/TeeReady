/**
 * Deterministic swing improvement plan — no AI.
 * Detect → rank → focus → schedule → checkpoints.
 */

import {
  getSwingDrill,
  type DrillLocation,
  type SwingDrillDef,
} from '../data/swingDrills';
import {
  getSwingFault,
  SETUP_CAUSE_COPY,
  SWING_FAULTS,
  type FaultDetectionRule,
  type SwingFaultDef,
} from '../data/swingFaults';
import type { GolfPlayerProfile } from './golfProfile';
import type { BiggestLeak, PracticeFocus } from './questionnaire';
import type { CameraAngle, SwingMetric } from './swing/types';
import { buildCoachPlan } from './goalCoach';

export type FaultSeverity = 'mild' | 'moderate' | 'severe';

export type MatchedFault = {
  faultId: string;
  label: string;
  severity: FaultSeverity;
  /** Metric that triggered detection. */
  metricId: string;
  metricValue: number;
  metricUnit: string;
  score: number;
  isRoot: boolean;
};

export type PlanCheckpoint = {
  week: number;
  metricId: string;
  metricLabel: string;
  angle: CameraAngle;
  currentValue: number;
  targetValue: number;
  unit: string;
  instruction: string;
};

export type PlanSessionDrill = {
  drillId: string;
  name: string;
  sets: number;
  reps: number;
  unit: string;
  location: DrillLocation;
  setup: string;
  execution: string;
  checkpoint: string;
  equipment: string[];
};

export type PlanSession = {
  id: string;
  week: number;
  label: string;
  location: DrillLocation;
  drills: PlanSessionDrill[];
};

export type SwingPlan = {
  matched: MatchedFault[];
  primary: MatchedFault;
  secondary: MatchedFault[];
  rootFaultId: string;
  causeChain: string[];
  causeChainNarrative: string;
  cycleWeeks: 2 | 4 | 6;
  sessions: PlanSession[];
  checkpoints: PlanCheckpoint[];
  drillLibrary: SwingDrillDef[];
  goalConflictNote: string | null;
  safetyLine: string;
  scopeLine: string;
};

const SAFETY_LINE =
  'Stop any drill that causes pain and consult a qualified professional. This guide is not medical care, physiotherapy, or injury treatment.';

const SCOPE_LINE =
  'This is measured swing feedback and practice structure — not a replacement for an in-person coach.';

function metricById(
  metrics: SwingMetric[],
  id: string,
): SwingMetric | undefined {
  return metrics.find((m) => m.id === id);
}

function ruleMatches(
  rule: FaultDetectionRule,
  metrics: SwingMetric[],
  captureAngle: CameraAngle,
): SwingMetric | null {
  if (rule.angle !== captureAngle) return null;
  const m = metricById(metrics, rule.metric);
  if (!m) return null;
  if (m.confidence === 'low') return null;
  if (m.angle !== rule.angle) return null;
  const v = m.value;
  switch (rule.comparator) {
    case '>':
      return v > rule.threshold ? m : null;
    case '>=':
      return v >= rule.threshold ? m : null;
    case '<':
      return v < rule.threshold ? m : null;
    case '<=':
      return v <= rule.threshold ? m : null;
    default:
      return null;
  }
}

function severityFor(
  fault: SwingFaultDef,
  rule: FaultDetectionRule,
  value: number,
): FaultSeverity {
  const { mild, moderate, severe } = fault.severityBands;
  const lowerIsWorse = rule.comparator === '<' || rule.comparator === '<=';
  if (lowerIsWorse) {
    // Bands are descending thresholds (e.g. 70 / 55 / 40).
    if (value <= severe) return 'severe';
    if (value <= moderate) return 'moderate';
    return 'mild';
  }
  // Magnitude for negative thresholds (reverse pivot).
  const mag =
    rule.threshold < 0 || value < 0 ? Math.abs(value) : value;
  if (mag >= severe) return 'severe';
  if (mag >= moderate) return 'moderate';
  if (mag >= mild) return 'mild';
  return 'mild';
}

const SEV_WEIGHT: Record<FaultSeverity, number> = {
  mild: 1,
  moderate: 2,
  severe: 3,
};

/** Detect faults from Phase 1 metrics. Low-confidence metrics never trigger. */
export function detectFaults(
  metrics: SwingMetric[],
  captureAngle: CameraAngle,
): MatchedFault[] {
  const out: MatchedFault[] = [];

  for (const fault of SWING_FAULTS) {
    if (!fault.detectedBy.length) continue;
    // All rules must match (AND) so multi-metric proxies stay honest.
    const matchedMetrics: SwingMetric[] = [];
    let triggerRule: FaultDetectionRule | null = null;
    let all = true;
    for (const rule of fault.detectedBy) {
      const m = ruleMatches(rule, metrics, captureAngle);
      if (!m) {
        all = false;
        break;
      }
      matchedMetrics.push(m);
      triggerRule = rule;
    }
    if (!all || !triggerRule || !matchedMetrics[0]) continue;

    const primaryMetric =
      matchedMetrics.find((m) => m.id === triggerRule!.metric) ?? matchedMetrics[0];
    const severity = severityFor(fault, triggerRule, primaryMetric.value);
    const score =
      SEV_WEIGHT[severity] * Math.max(1, fault.consequences.length);

    out.push({
      faultId: fault.id,
      label: fault.label,
      severity,
      metricId: primaryMetric.id,
      metricValue: primaryMetric.value,
      metricUnit: primaryMetric.unit,
      score,
      isRoot: false,
    });
  }

  return out;
}

/**
 * Prefer parents in the cause graph that are also detected.
 * If none, the fault is its own root.
 */
export function findRootFaultId(matched: MatchedFault[]): string | null {
  if (!matched.length) return null;
  const ids = new Set(matched.map((m) => m.faultId));

  const depthToRoot = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    const def = getSwingFault(id);
    if (!def) return 0;
    const parentFaults = def.causes.filter((c) => ids.has(c));
    if (!parentFaults.length) return 0;
    return 1 + Math.max(...parentFaults.map((p) => depthToRoot(p, seen)));
  };

  // Root candidates: matched faults that are causes of others, or deepest parents.
  let best: MatchedFault | null = null;
  let bestScore = -1;
  for (const m of matched) {
    const def = getSwingFault(m.faultId);
    if (!def) continue;
    const parents = def.causes.filter((c) => ids.has(c));
    // Prefer a matched parent as root over the symptom.
    if (parents.length) continue;
    const rootBoost = matched.some((o) =>
      (getSwingFault(o.faultId)?.causes ?? []).includes(m.faultId),
    )
      ? 10
      : 0;
    const s = m.score + rootBoost + depthToRoot(m.faultId, new Set());
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }

  if (best) return best.faultId;

  // Everything has parents in the set — pick highest score.
  const ranked = [...matched].sort((a, b) => b.score - a.score);
  return ranked[0]?.faultId ?? null;
}

function leakBoost(
  fault: SwingFaultDef,
  leak: BiggestLeak,
  goals: string[],
): number {
  let n = 0;
  if (fault.alignsWithLeaks?.includes(leak)) n += 4;
  for (const g of goals) {
    if (fault.alignsWithGoals?.includes(g)) n += 2;
  }
  return n;
}

export function rankFaults(
  matched: MatchedFault[],
  profile: Pick<GolfPlayerProfile, 'biggestLeak' | 'goals' | 'customGoals'>,
): MatchedFault[] {
  const rootId = findRootFaultId(matched);
  return [...matched]
    .map((m) => {
      const def = getSwingFault(m.faultId)!;
      const boost = leakBoost(def, profile.biggestLeak, profile.goals);
      const rootBonus = m.faultId === rootId ? 8 : 0;
      return {
        ...m,
        isRoot: m.faultId === rootId,
        score: m.score + boost + rootBonus,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectFocus(ranked: MatchedFault[]): {
  primary: MatchedFault;
  secondary: MatchedFault[];
} | null {
  if (!ranked.length) return null;
  const primary =
    ranked.find((m) => m.isRoot) ?? ranked[0]!;
  const secondary = ranked
    .filter((m) => m.faultId !== primary.faultId)
    .slice(0, 2);
  return { primary, secondary };
}

export function cycleWeeksFor(severity: FaultSeverity): 2 | 4 | 6 {
  if (severity === 'mild') return 2;
  if (severity === 'moderate') return 4;
  return 6;
}

function locationWeight(
  focus: PracticeFocus,
  roundsPerMonth: number,
): DrillLocation[] {
  if (focus === 'course') {
    return ['course', 'range', 'home', 'gym'];
  }
  if (roundsPerMonth <= 2) {
    return ['home', 'range', 'course', 'gym'];
  }
  if (focus === 'range') {
    return ['range', 'home', 'course', 'gym'];
  }
  return ['range', 'home', 'course', 'gym'];
}

function pickDrillsForFault(
  faultId: string,
  prefer: DrillLocation[],
  limit: number,
): SwingDrillDef[] {
  const def = getSwingFault(faultId);
  if (!def) return [];
  const drills = def.drills
    .map((id) => getSwingDrill(id))
    .filter((d): d is SwingDrillDef => Boolean(d));

  const scored = drills.map((d) => ({
    d,
    score: prefer.indexOf(d.location) === -1 ? 20 : prefer.indexOf(d.location),
  }));
  scored.sort((a, b) => a.score - b.score || a.d.difficulty - b.d.difficulty);
  const picked: SwingDrillDef[] = [];
  for (const { d } of scored) {
    if (picked.some((p) => p.id === d.id)) continue;
    picked.push(d);
    if (picked.length >= limit) break;
  }
  return picked;
}

export function buildSchedule(opts: {
  primaryFaultId: string;
  severity: FaultSeverity;
  practiceFocus: PracticeFocus;
  roundsPerMonthGoal: number;
}): { cycleWeeks: 2 | 4 | 6; sessions: PlanSession[]; drills: SwingDrillDef[] } {
  const cycleWeeks = cycleWeeksFor(opts.severity);
  const prefer = locationWeight(opts.practiceFocus, opts.roundsPerMonthGoal);
  const pool = pickDrillsForFault(opts.primaryFaultId, prefer, 4);
  // Always include a course pre-round feel when practice is course-weighted.
  const preRound = getSwingDrill('pre-round-three-feel');
  const drills =
    opts.practiceFocus === 'course' && preRound && !pool.some((d) => d.id === preRound.id)
      ? [...pool.slice(0, 3), preRound]
      : pool;

  const sessionsPerWeek =
    opts.roundsPerMonthGoal <= 2 ? 2 : opts.roundsPerMonthGoal <= 4 ? 3 : 4;

  const sessions: PlanSession[] = [];
  for (let w = 1; w <= cycleWeeks; w++) {
    for (let s = 0; s < sessionsPerWeek; s++) {
      const loc =
        prefer[Math.min(s, prefer.length - 1)] ?? 'range';
      const sessionDrills = drills
        .filter((d) => (s === 0 ? true : d.location !== 'course' || loc === 'course'))
        .slice(0, opts.roundsPerMonthGoal <= 2 ? 2 : 3)
        .map((d) => ({
          drillId: d.id,
          name: d.name,
          sets: d.reps.sets,
          reps: d.reps.reps,
          unit: d.reps.unit,
          location: d.location,
          setup: d.setup,
          execution: d.execution,
          checkpoint: d.checkpoint,
          equipment: d.equipment,
        }));

      // Prefer location-matching drills for this session slot.
      const localized = drills
        .filter((d) => d.location === loc || (loc === 'home' && d.location === 'home'))
        .slice(0, 2)
        .map((d) => ({
          drillId: d.id,
          name: d.name,
          sets: d.reps.sets,
          reps: d.reps.reps,
          unit: d.reps.unit,
          location: d.location,
          setup: d.setup,
          execution: d.execution,
          checkpoint: d.checkpoint,
          equipment: d.equipment,
        }));

      const chosen =
        localized.length >= 1
          ? [...localized, ...sessionDrills]
              .filter((d, i, arr) => arr.findIndex((x) => x.drillId === d.drillId) === i)
              .slice(0, opts.roundsPerMonthGoal <= 2 ? 2 : 3)
          : sessionDrills;

      if (!chosen.length) continue;

      sessions.push({
        id: `w${w}-s${s + 1}`,
        week: w,
        label: `Week ${w} · session ${s + 1}`,
        location: loc,
        drills: chosen,
      });
    }
  }

  return { cycleWeeks, sessions, drills };
}

export function buildCheckpoints(opts: {
  primary: MatchedFault;
  cycleWeeks: number;
  metrics: SwingMetric[];
}): PlanCheckpoint[] {
  const fault = getSwingFault(opts.primary.faultId);
  const metric = metricById(opts.metrics, opts.primary.metricId);
  if (!fault || !metric) return [];

  const rule = fault.detectedBy.find((r) => r.metric === metric.id) ?? fault.detectedBy[0]!;
  const lowerIsWorse = rule.comparator === '<' || rule.comparator === '<=';

  let target: number;
  if (lowerIsWorse) {
    // Move up toward (or past) the mild band edge.
    target = Math.max(fault.severityBands.mild, rule.threshold);
  } else if (rule.threshold < 0) {
    // Reverse pivot: move toward 0.
    target = -Math.min(fault.severityBands.mild * 0.5, Math.abs(opts.primary.metricValue) * 0.4);
  } else {
    // Reduce toward just under mild / threshold.
    target = Math.min(rule.threshold, fault.severityBands.mild) * 0.75;
    if (metric.unit === '°' && metric.id === 'early_extension') {
      target = Math.min(6, rule.threshold * 0.75);
    }
  }

  target = Math.round(target * 1000) / 1000;
  const angle = rule.angle;
  const weeks: number[] = [];
  for (let w = 2; w <= opts.cycleWeeks; w += 2) weeks.push(w);
  if (!weeks.includes(opts.cycleWeeks)) weeks.push(opts.cycleWeeks);

  return weeks.map((week) => ({
    week,
    metricId: metric.id,
    metricLabel: metric.label,
    angle,
    currentValue: metric.value,
    targetValue: target,
    unit: metric.unit,
    instruction: `Re-record ${angle === 'dtl' ? 'down-the-line' : 'face-on'} at week ${week}; ${metric.label} currently ${formatMetric(metric.value, metric.unit)}, target ${formatMetric(target, metric.unit)}.`,
  }));
}

function formatMetric(value: number, unit: string): string {
  if (unit === '°') return `${value}°`;
  if (unit === ':1') return `${value}:1`;
  return `${value} ${unit}`;
}

export function buildCauseChainNarrative(
  primaryId: string,
  matchedIds: Set<string>,
): { chain: string[]; narrative: string } {
  const fault = getSwingFault(primaryId);
  if (!fault) return { chain: [], narrative: '' };

  const chain: string[] = [];
  for (const c of fault.causes) {
    if (matchedIds.has(c) || SETUP_CAUSE_COPY[c]) {
      chain.push(c);
    }
  }

  const parts = chain.map((id) => {
    if (SETUP_CAUSE_COPY[id]) return SETUP_CAUSE_COPY[id];
    return getSwingFault(id)?.label ?? id;
  });

  const narrative =
    parts.length === 0
      ? `${fault.label} is the focus; no matched parent fault in this capture.`
      : `${fault.label} is linked in the authored graph to: ${parts.join('; ')}.`;

  return { chain, narrative };
}

export function resolveGoalConflict(
  primary: MatchedFault,
  profile: GolfPlayerProfile,
): string | null {
  const plan = buildCoachPlan(profile, 'Player');
  const fault = getSwingFault(primary.faultId);
  if (!fault) return null;

  const leak = profile.biggestLeak;
  const swingHelpsLeak = fault.alignsWithLeaks?.includes(leak) ?? false;
  const goalIds = profile.goals;
  const swingHelpsGoal = goalIds.some((g) => fault.alignsWithGoals?.includes(g));
  const headline = plan?.headline ?? 'your on-course coach plan';

  if (leak === 'putting' || leak === 'short-game' || leak === 'mental') {
    if (!swingHelpsLeak && !swingHelpsGoal) {
      return `Your questionnaire focus is ${leak.replace('-', ' ')}, while this swing cycle works ${fault.label.toLowerCase()}. Keep short-game/putting practice on its own days — do not replace it with full-swing volume. Today’s coach plan (“${headline}”) still stands for on-course priorities.`;
    }
  }

  if (swingHelpsLeak || swingHelpsGoal) {
    return `This swing focus supports your stated ${swingHelpsLeak ? `leak (${leak})` : 'goals'} and lines up with your coach plan: ${headline}.`;
  }

  return `Swing work this cycle is ${fault.label.toLowerCase()}. Your broader coach plan remains “${headline}” — use prep/GPS for course management while this cycle stays on one swing root.`;
}

export function buildSwingPlan(opts: {
  metrics: SwingMetric[];
  angle: CameraAngle;
  profile: GolfPlayerProfile;
}): SwingPlan | null {
  const detected = detectFaults(opts.metrics, opts.angle);
  if (!detected.length) return null;

  const ranked = rankFaults(detected, opts.profile);
  const focus = selectFocus(ranked);
  if (!focus) return null;

  const matchedIds = new Set(ranked.map((m) => m.faultId));
  const { chain, narrative } = buildCauseChainNarrative(
    focus.primary.faultId,
    matchedIds,
  );

  const { cycleWeeks, sessions, drills } = buildSchedule({
    primaryFaultId: focus.primary.faultId,
    severity: focus.primary.severity,
    practiceFocus: opts.profile.practiceFocus,
    roundsPerMonthGoal: opts.profile.roundsPerMonthGoal,
  });

  const checkpoints = buildCheckpoints({
    primary: focus.primary,
    cycleWeeks,
    metrics: opts.metrics,
  });

  return {
    matched: ranked,
    primary: focus.primary,
    secondary: focus.secondary,
    rootFaultId: focus.primary.faultId,
    causeChain: chain,
    causeChainNarrative: narrative,
    cycleWeeks,
    sessions,
    checkpoints,
    drillLibrary: drills,
    goalConflictNote: resolveGoalConflict(focus.primary, opts.profile),
    safetyLine: SAFETY_LINE,
    scopeLine: SCOPE_LINE,
  };
}

export { SAFETY_LINE, SCOPE_LINE };
