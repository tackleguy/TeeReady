/** Pure TypeScript ballistic physics — no external deps. */

import {
  CLUB_ROLL_PCT,
  CLUB_SPIN_RPM,
  DEFAULT_ASSUMED_SPIN_RPM,
  GOLF_BALL_DIAMETER_MM,
  LM_NUMBERS_MIN_FPS,
} from './constants';
import { fpsAccuracyAssumptions } from './accuracy';
import {
  analyzeCornerFlight,
  ballSpeedFromEarlyTrack,
  CORNER_ASSUMPTIONS,
} from './corner';
import { directionMetric } from './directionMetric';
import type { CameraAngle, LaunchMetric, ScaleCalibration, TrackPoint } from './types';

const GRAVITY_M_S2 = 9.80665;
const MM_TO_M = 0.001;
const MPS_TO_MPH = 2.23694;
const M_TO_YARDS = 1.09361;

export type PhysicsInput = {
  track: TrackPoint[];
  fps: number;
  angle: CameraAngle;
  scale: ScaleCalibration | null;
  club?: string;
};

export type PhysicsOutput = {
  metrics: LaunchMetric[];
  unavailable: Record<string, string>;
};

function clubKey(club?: string): string {
  return club?.toLowerCase().replace(/\s+/g, '-') ?? 'driver';
}

function assumedSpinRpm(club?: string): number {
  const key = clubKey(club);
  return CLUB_SPIN_RPM[key] ?? DEFAULT_ASSUMED_SPIN_RPM;
}

/** Launch angle (degrees above horizontal) from early flight — face-on. */
function launchAngleFaceOn(track: TrackPoint[]): number | null {
  if (track.length < 3) return null;
  const n = Math.min(5, track.length);
  let sumDx = 0;
  let sumDy = 0;
  for (let i = 1; i < n; i++) {
    sumDx += track[i]!.px - track[0]!.px;
    sumDy += track[0]!.py - track[i]!.py;
  }
  if (Math.abs(sumDx) < 0.5 && Math.abs(sumDy) < 0.5) return null;
  return (Math.atan2(sumDy, Math.abs(sumDx) / (n - 1)) * 180) / Math.PI;
}

/**
 * Ballistic carry with simplified Magnus lift from assumed spin.
 */
export function estimateCarryYards(
  ballSpeedMph: number,
  launchAngleDeg: number,
  spinRpm: number,
): number {
  const v0 = ballSpeedMph / MPS_TO_MPH;
  const theta = (launchAngleDeg * Math.PI) / 180;
  const vx = v0 * Math.cos(theta);
  const vy = v0 * Math.sin(theta);

  const spinRadS = (spinRpm * 2 * Math.PI) / 60;
  const liftFactor =
    1 + Math.min(0.35, spinRadS * GOLF_BALL_DIAMETER_MM * MM_TO_M * 0.002);

  const gEff = GRAVITY_M_S2 / liftFactor;
  if (launchAngleDeg < 1) {
    return Math.max(0, vx * 0.15 * M_TO_YARDS);
  }

  const tFlight = (2 * vy) / gEff;
  return Math.max(0, vx * tFlight * M_TO_YARDS);
}

/** Total distance = carry + typical roll for club. */
export function estimateTotalYards(carryYd: number, club?: string): number {
  const pct = CLUB_ROLL_PCT[clubKey(club)] ?? 0.05;
  return Math.round(carryYd * (1 + pct));
}

function pushMetric(
  metrics: LaunchMetric[],
  metric: LaunchMetric,
): void {
  const idx = metrics.findIndex((m) => m.id === metric.id);
  if (idx >= 0) metrics[idx] = metric;
  else metrics.push(metric);
}

function addCarryAndTotal(
  metrics: LaunchMetric[],
  _unavailable: Record<string, string>,
  speedVal: number,
  launchVal: number,
  angle: CameraAngle,
  club: string | undefined,
  fpsAssumptions: string[],
  extraAssumptions: string[] = [],
): void {
  const spin = assumedSpinRpm(club);
  const carry = estimateCarryYards(speedVal, launchVal, spin);
  pushMetric(metrics, {
    id: 'carry',
    label: 'Carry',
    value: Math.round(carry),
    unit: 'yd',
    confidence: 'uncalibrated',
    validForAngle: angle,
    assumptions: [
      'Carry uses typical flight for selected club — spin is not measured.',
      'Carry is modelled, not measured — not validated against TrackMan.',
      ...extraAssumptions,
      ...fpsAssumptions,
    ],
  });

  const total = estimateTotalYards(carry, club);
  pushMetric(metrics, {
    id: 'total',
    label: 'Total',
    value: total,
    unit: 'yd',
    confidence: 'uncalibrated',
    validForAngle: angle,
    assumptions: [
      `Total = carry + typical roll (${Math.round((CLUB_ROLL_PCT[clubKey(club)] ?? 0.05) * 100)}% for ${club ?? 'driver'}).`,
      'Roll varies with ground hardness and slope — not measured.',
      ...extraAssumptions,
      ...fpsAssumptions,
    ],
  });
}

export function computeLaunchMetrics(input: PhysicsInput): PhysicsOutput {
  const { track, fps, angle, scale, club } = input;
  const metrics: LaunchMetric[] = [];
  const unavailable: Record<string, string> = {};
  const fpsAssumptions = fpsAccuracyAssumptions(fps);

  if (fps < LM_NUMBERS_MIN_FPS) {
    const msg = `Needs ${LM_NUMBERS_MIN_FPS}+ fps measured (got ~${Math.round(fps)}). Tracer only.`;
    unavailable.launch_direction = msg;
    unavailable.carry = msg;
    unavailable.total = msg;
    return { metrics, unavailable };
  }

  if (!scale) {
    const msg = 'Could not calibrate scale — ball not detected at address.';
    unavailable.launch_direction = msg;
    unavailable.carry = msg;
    unavailable.total = msg;
    return { metrics, unavailable };
  }

  if (angle === 'corner') {
    const flight = analyzeCornerFlight(track, scale.mmPerPixel);
    if (!flight) {
      const msg = 'Not enough post-impact track for analysis.';
      unavailable.launch_direction = msg;
      unavailable.carry = msg;
      unavailable.total = msg;
      return { metrics, unavailable };
    }

    pushMetric(
      metrics,
      directionMetric(flight.directionDeg, 'corner', [
        ...CORNER_ASSUMPTIONS,
        ...fpsAssumptions,
      ]),
    );

    addCarryAndTotal(
      metrics,
      unavailable,
      flight.ballSpeedMph,
      flight.launchAngleDeg,
      'corner',
      club,
      fpsAssumptions,
      [...CORNER_ASSUMPTIONS],
    );
    return { metrics, unavailable };
  }

  const speed = ballSpeedFromEarlyTrack(track, fps, scale.mmPerPixel);

  if (angle === 'face-on') {
    const launch = launchAngleFaceOn(track);
    if (speed != null && launch != null && Number.isFinite(launch)) {
      addCarryAndTotal(metrics, unavailable, speed, launch, 'face-on', club, fpsAssumptions);
    } else {
      unavailable.carry = 'Could not estimate yardage — need a clear face-on track.';
      unavailable.total = unavailable.carry;
    }
    unavailable.launch_direction =
      'Direction needs corner view — face-on shows yardage only.';
    return { metrics, unavailable };
  }

  if (angle === 'dtl') {
    unavailable.carry = 'Yardage needs corner or face-on view.';
    unavailable.total = unavailable.carry;
    unavailable.launch_direction = 'Use corner view (6–10 ft behind) for direction + yardage.';
    return { metrics, unavailable };
  }

  return { metrics, unavailable };
}

/** Hand-computed reference cases for unit tests. */
export function mphFromPixels(
  dxPx: number,
  dyPx: number,
  dtSec: number,
  mmPerPixel: number,
): number {
  const dx = dxPx * mmPerPixel * MM_TO_M;
  const dy = dyPx * mmPerPixel * MM_TO_M;
  const speedMps = Math.hypot(dx, dy) / dtSec;
  return speedMps * MPS_TO_MPH;
}
