/** Derive a simple 0–100 swing score and headline cues from on-device metrics. */

import type { SwingAnalysis, SwingMetric } from './swing';

const IDEAL: Record<string, { target: number; tol: number }> = {
  tempo: { target: 3, tol: 0.6 },
  'shoulder-turn': { target: 90, tol: 20 },
  'hip-turn': { target: 45, tol: 15 },
  'head-sway': { target: 2, tol: 4 },
  'spine-angle': { target: 30, tol: 12 },
};

function metricKey(m: SwingMetric): string {
  return m.id.toLowerCase();
}

function scoreMetric(m: SwingMetric): number {
  const ideal = IDEAL[metricKey(m)] ?? IDEAL[m.label.toLowerCase().replace(/\s+/g, '-')];
  if (!ideal) {
    return m.confidence === 'high' ? 78 : 62;
  }
  const err = Math.abs(m.value - ideal.target) / ideal.tol;
  const raw = Math.max(0, 100 - err * 28);
  return m.confidence === 'low' ? raw * 0.85 : raw;
}

export type SwingScorecard = {
  score: number;
  biggestIssue: string;
  doingWell: string[];
  fixThis: string;
  drill: string;
  practice: string;
};

function pickIssue(metrics: SwingMetric[], summary: string): string {
  const low = metrics.filter((m) => m.confidence === 'low');
  if (low[0]) return low[0].label;
  const worst = [...metrics].sort((a, b) => scoreMetric(a) - scoreMetric(b))[0];
  if (worst && scoreMetric(worst) < 70) return worst.label;
  const first = summary.split(/[.!\n]/)[0]?.trim();
  return first && first.length < 48 ? first : 'Contact consistency';
}

export function swingScorecard(analysis: SwingAnalysis): SwingScorecard {
  const metrics = analysis.metrics;
  const scores = metrics.map(scoreMetric);
  const avg =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 72;
  const score = Math.min(98, Math.max(42, avg));

  const ranked = [...metrics].sort((a, b) => scoreMetric(b) - scoreMetric(a));
  const doingWell = ranked
    .filter((m) => scoreMetric(m) >= 72)
    .slice(0, 3)
    .map((m) => m.label);

  if (doingWell.length === 0) {
    doingWell.push('Full finish', 'Athletic posture');
  }

  const biggestIssue = pickIssue(metrics, analysis.summary);
  const coachLine =
    analysis.coach?.text?.split(/[.!\n]/)[0]?.trim() ||
    analysis.summary.split(/[.!\n]/)[0]?.trim() ||
    'Hold your posture through impact.';

  return {
    score,
    biggestIssue,
    doingWell,
    fixThis: coachLine,
    drill: `Slow-motion reps focusing on ${biggestIssue.toLowerCase()} — 10 swings, pause at the top.`,
    practice: `One cue only: ${coachLine}`,
  };
}

export function swingDelta(
  previous: SwingAnalysis | undefined,
  current: SwingAnalysis,
): number | null {
  if (!previous) return null;
  return swingScorecard(current).score - swingScorecard(previous).score;
}
