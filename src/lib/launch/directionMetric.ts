/** User-facing direction metric (yardage computed separately). */

import type { CameraAngle, LaunchConfidence, LaunchMetric } from './types';

export function directionMetric(
  directionDeg: number,
  angle: CameraAngle,
  assumptions: string[],
): LaunchMetric {
  return {
    id: 'launch_direction',
    label: 'Direction',
    value: Math.round(directionDeg * 10) / 10,
    unit: '°',
    confidence: 'uncalibrated' as LaunchConfidence,
    validForAngle: angle,
    assumptions,
  };
}
