/** Landing points and session stats from launch monitor analyses. */

import type { LaunchAnalysis } from '../launch/types';
import type { DispersionBand, RangeLanding, RangeSessionStats } from './types';

function metricValue(analysis: LaunchAnalysis, id: string): number | null {
  const m = analysis.metrics.find((x) => x.id === id);
  return m != null ? m.value : null;
}

/** Map carry + start direction to a top-down landing point. */
export function landingFromAnalysis(analysis: LaunchAnalysis): RangeLanding | null {
  const carry = metricValue(analysis, 'carry');
  if (carry == null || carry <= 0) return null;

  const total = metricValue(analysis, 'total');
  const direction = metricValue(analysis, 'launch_direction');
  const dir = direction ?? 0;
  const rad = (dir * Math.PI) / 180;
  const lateralYd = carry * Math.tan(rad);

  return {
    launchId: analysis.id,
    createdAt: analysis.createdAt,
    carryYd: carry,
    totalYd: total,
    directionDeg: direction,
    lateralYd,
    downrangeYd: carry,
  };
}

function avg(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

export function computeSessionStats(landings: RangeLanding[]): RangeSessionStats {
  if (landings.length === 0) {
    return {
      shotCount: 0,
      avgCarryYd: null,
      avgLateralYd: null,
      lateralSpreadYd: null,
      carrySpreadYd: null,
      avgDirectionDeg: null,
    };
  }

  const carries = landings.map((l) => l.carryYd);
  const laterals = landings.map((l) => l.lateralYd);
  const directions = landings.map((l) => l.directionDeg ?? 0);

  return {
    shotCount: landings.length,
    avgCarryYd: Math.round(avg(carries)),
    avgLateralYd: Math.round(avg(laterals) * 10) / 10,
    lateralSpreadYd: Math.round(spread(laterals)),
    carrySpreadYd: Math.round(spread(carries)),
    avgDirectionDeg: Math.round(avg(directions) * 10) / 10,
  };
}

/** Resolve landings for a session from launch history. */
export function landingsForSession(
  shotIds: string[],
  history: LaunchAnalysis[],
): RangeLanding[] {
  const byId = new Map(history.map((a) => [a.id, a]));
  const out: RangeLanding[] = [];
  for (const id of shotIds) {
    const analysis = byId.get(id);
    if (!analysis) continue;
    const landing = landingFromAnalysis(analysis);
    if (landing) out.push(landing);
  }
  return out;
}

/** All plottable shots from launch history (newest first). */
export function landingsFromHistory(history: LaunchAnalysis[]): RangeLanding[] {
  return history
    .map((a) => landingFromAnalysis(a))
    .filter((l): l is RangeLanding => l != null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** ~1σ dispersion ellipse for 3+ shots. */
export function computeDispersionBand(landings: RangeLanding[]): DispersionBand | null {
  if (landings.length < 3) return null;

  const lat = landings.map((l) => l.lateralYd);
  const carry = landings.map((l) => l.carryYd);
  const meanLat = avg(lat);
  const meanCarry = avg(carry);

  const std = (values: number[], mean: number) =>
    Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);

  const semiLat = std(lat, meanLat);
  const semiCarry = std(carry, meanCarry);
  if (semiLat < 0.5 && semiCarry < 0.5) return null;

  return {
    centerLateralYd: meanLat,
    centerCarryYd: meanCarry,
    semiAxisLatYd: Math.max(semiLat, 1),
    semiAxisCarryYd: Math.max(semiCarry, 1),
  };
}
