/** User-facing launch metrics — yardage + direction only. */

import type { LaunchMetric } from './types';

export const DISPLAY_METRIC_IDS = new Set([
  'carry',
  'total',
  'launch_direction',
]);

export function filterDisplayMetrics(metrics: LaunchMetric[]): LaunchMetric[] {
  return metrics.filter((m) => DISPLAY_METRIC_IDS.has(m.id));
}

export function formatDirection(metric: LaunchMetric): string {
  if (metric.id !== 'launch_direction') {
    return metric.unit === 'yd' ? `${metric.value} yd` : `${metric.value} ${metric.unit}`;
  }
  const v = metric.value;
  if (Math.abs(v) < 2) return 'Straight';
  return v > 0 ? `${Math.round(Math.abs(v))}° right` : `${Math.round(Math.abs(v))}° left`;
}

export function directionLabel(metric: LaunchMetric): string {
  return formatDirection(metric);
}

/** Filter unavailable to display-relevant keys only. */
export function filterDisplayUnavailable(
  unavailable: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ['carry', 'total', 'launch_direction'] as const) {
    if (unavailable[key]) out[key] = unavailable[key]!;
  }
  return out;
}
