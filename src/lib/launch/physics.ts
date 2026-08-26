/** Pure TypeScript ballistic physics — no external deps. */

import {
  CLUB_SPIN_RPM,
  DEFAULT_ASSUMED_SPIN_RPM,
  GOLF_BALL_DIAMETER_MM,
  LM_NUMBERS_MIN_FPS,
} from './constants';
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

function assumedSpinRpm(club?: string): { rpm: number; assumptions: string[] } {
  const key = club?.toLowerCase().replace(/\s+/g, '-') ?? 'driver';
  const rpm = CLUB_SPIN_RPM[key] ?? DEFAULT_ASSUMED_SPIN_RPM;
  return {
    rpm,
    assumptions: [
      `Spin not measurable — assumed ${rpm} rpm typical for ${club ?? 'driver'}.`,
      'Mishits can differ by thousands of rpm; carry uncertainty is dominated by this assumption.',
    ],
  };
}

/** Ball speed from first two post-impact track points. */
function ballSpeedMph(
  track: TrackPoint[],
  fps: number,
  mmPerPixel: number,
): number | null {
  if (track.length < 2 || fps <= 0) return null;
  const dx = (track[1]!.px - track[0]!.px) * mmPerPixel * MM_TO_M;
  const dy = (track[1]!.py - track[0]!.py) * mmPerPixel * MM_TO_M;
  const dt = (track[1]!.t - track[0]!.t) || 1 / fps;
  const speedMps = Math.hypot(dx, dy) / dt;
  return speedMps * MPS_TO_MPH;
}

/** Launch angle (degrees above horizontal) from early flight — face-on only. */
function launchAngleDeg(track: TrackPoint[]): number | null {
  if (track.length < 3) return null;
  const dx = track[2]!.px - track[0]!.px;
  const dy = track[0]!.py - track[2]!.py; // screen y grows downward
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return null;
  return (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
}

/**
 * Simple carry model: vacuum-ish ballistic with Magnus lift from assumed spin.
 * Returns carry yards. Not validated against TrackMan.
 */
export function estimateCarryYards(
  ballSpeedMph: number,
  launchAngleDeg: number,
  spinRpm: number,
): number {
  const v0 = ballSpeedMph / MPS_TO_MPH; // m/s
  const theta = (launchAngleDeg * Math.PI) / 180;
  const vx = v0 * Math.cos(theta);
  const vy = v0 * Math.sin(theta);

  // Lift coefficient proxy from backspin (very simplified).
  const spinRadS = (spinRpm * 2 * Math.PI) / 60;
  const liftFactor = 1 + Math.min(0.35, spinRadS * GOLF_BALL_DIAMETER_MM * MM_TO_M * 0.002);

  const gEff = GRAVITY_M_S2 / liftFactor;
  if (launchAngleDeg < 1) {
    // Ground-bounded — minimal roll estimate only.
    return Math.max(0, vx * 0.15 * M_TO_YARDS);
  }

  const tFlight = (2 * vy) / gEff;
  const carryM = vx * tFlight;
  return Math.max(0, carryM * M_TO_YARDS);
}

export function computeLaunchMetrics(input: PhysicsInput): PhysicsOutput {
  const { track, fps, angle, scale, club } = input;
  const metrics: LaunchMetric[] = [];
  const unavailable: Record<string, string> = {};

  const spinInfo = assumedSpinRpm(club);
  const spinAssumptions = spinInfo.assumptions;

  if (fps < LM_NUMBERS_MIN_FPS) {
    unavailable.ball_speed = `Needs ${LM_NUMBERS_MIN_FPS}+ fps measured (got ~${Math.round(fps)}). Tracer only.`;
    unavailable.launch_angle = unavailable.ball_speed;
    unavailable.carry = unavailable.ball_speed;
    unavailable.spin = 'Spin is not measurable from a single phone camera.';
    return { metrics, unavailable };
  }

  unavailable.spin = 'Spin is not measurable from a single phone camera.';

  if (!scale) {
    unavailable.ball_speed = 'Could not calibrate scale — ball not detected at address.';
    unavailable.launch_angle = unavailable.ball_speed;
    unavailable.carry = unavailable.ball_speed;
    return { metrics, unavailable };
  }

  const speed = ballSpeedMph(track, fps, scale.mmPerPixel);
  if (speed != null && Number.isFinite(speed)) {
    metrics.push({
      id: 'ball_speed',
      label: 'Ball speed',
      value: Math.round(speed * 10) / 10,
      unit: 'mph',
      confidence: 'uncalibrated',
      validForAngle: angle,
      assumptions: [...scale.assumptions, ...spinAssumptions],
    });
  } else {
    unavailable.ball_speed = 'Not enough post-impact track points for speed.';
  }

  if (angle === 'face-on') {
    const launch = launchAngleDeg(track);
    if (launch != null && Number.isFinite(launch)) {
      metrics.push({
        id: 'launch_angle',
        label: 'Launch angle',
        value: Math.round(launch * 10) / 10,
        unit: '°',
        confidence: 'uncalibrated',
        validForAngle: 'face-on',
        assumptions: [
          'Launch angle valid only from face-on camera.',
          '2D projection — true 3D launch may differ.',
        ],
      });
    } else {
      unavailable.launch_angle =
        'Could not estimate launch angle — need face-on view with ≥3 track points.';
    }
  } else {
    unavailable.launch_angle =
      'Launch angle is foreshortened from down-the-line — not reported (null beats guess).';
  }

  if (angle === 'dtl') {
    const speedMetric = metrics.find((m) => m.id === 'ball_speed');
    if (speedMetric) {
      metrics.push({
        id: 'ball_speed_dtl',
        label: 'Speed (line component)',
        value: speedMetric.value,
        unit: 'mph',
        confidence: 'uncalibrated',
        validForAngle: 'dtl',
        assumptions: [
          'Component along target line only — may underestimate true ball speed.',
          ...scale.assumptions,
        ],
      });
    }
    unavailable.launch_direction = 'Launch direction requires down-the-line view with lateral motion visible.';
  } else {
    unavailable.launch_direction =
      'Launch direction is unmeasurable from face-on — ball moves toward/away from camera.';
  }

  const speedVal = metrics.find((m) => m.id === 'ball_speed')?.value;
  const launchVal = metrics.find((m) => m.id === 'launch_angle')?.value;

  if (speedVal != null && launchVal != null && angle === 'face-on') {
    const carry = estimateCarryYards(speedVal, launchVal, spinInfo.rpm);
    metrics.push({
      id: 'carry',
      label: 'Carry (estimated)',
      value: Math.round(carry),
      unit: 'yd',
      confidence: 'uncalibrated',
      validForAngle: 'face-on',
      assumptions: [
        ...spinAssumptions,
        'Carry is modelled, not measured — confidence cannot exceed spin assumption.',
        'Simple ballistic model — not validated against TrackMan.',
      ],
    });
  } else if (angle === 'face-on') {
    unavailable.carry = 'Need ball speed and launch angle for carry estimate.';
  } else {
    unavailable.carry =
      'Carry needs launch angle (face-on). From DTL, only speed component along line is valid.';
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
