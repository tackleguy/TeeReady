/** Corner-view geometry — multi-point flight fit and 3D decomposition. */

import {
  CORNER_AZIMUTH_DEG,
  CORNER_DOWNRANGE_PITCH,
} from './constants';
import type { TrackPoint } from './types';

const CORNER_AZ = (CORNER_AZIMUTH_DEG * Math.PI) / 180;
const SIN_A = Math.sin(CORNER_AZ);
const COS_A = Math.cos(CORNER_AZ);
const MM_TO_M = 0.001;
const MPS_TO_MPH = 2.23694;

export const CORNER_ASSUMPTIONS = [
  `Assumes corner setup ~${CORNER_AZIMUTH_DEG}° off target line, 6–10 ft behind ball.`,
  'Launch angle, direction, and speed from early-flight track fit — not radar-grade.',
] as const;

export type GroundVelocity = {
  lateralMps: number;
  downrangeMps: number;
  verticalMps: number;
};

export type CornerFlight = {
  ballSpeedMph: number;
  launchAngleDeg: number;
  directionDeg: number;
  ground: GroundVelocity;
};

/** Linear regression velocity (px/s) over earliest post-impact points. */
export function fitScreenVelocity(
  track: TrackPoint[],
  maxPoints = 6,
): { vx: number; vy: number } | null {
  const n = Math.min(maxPoints, track.length);
  if (n < 2) return null;

  let sumT = 0;
  let sumT2 = 0;
  let sumPx = 0;
  let sumPy = 0;
  let sumTPx = 0;
  let sumTPy = 0;

  for (let i = 0; i < n; i++) {
    const p = track[i]!;
    sumT += p.t;
    sumT2 += p.t * p.t;
    sumPx += p.px;
    sumPy += p.py;
    sumTPx += p.t * p.px;
    sumTPy += p.t * p.py;
  }

  const denom = n * sumT2 - sumT * sumT;
  if (Math.abs(denom) < 1e-12) return null;

  return {
    vx: (n * sumTPx - sumT * sumPx) / denom,
    vy: (n * sumTPy - sumT * sumPy) / denom,
  };
}

/** Pairwise speeds (px/s) for the first few intervals — impact is fastest early. */
function earlyPairwiseVelocities(track: TrackPoint[]): Array<{ vx: number; vy: number; dt: number }> {
  const out: Array<{ vx: number; vy: number; dt: number }> = [];
  const limit = Math.min(4, track.length - 1);
  for (let i = 0; i < limit; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    const dt = Math.max(b.t - a.t, 1e-6);
    out.push({
      vx: (b.px - a.px) / dt,
      vy: (b.py - a.py) / dt,
      dt,
    });
  }
  return out;
}

/**
 * Decompose screen-plane velocity (px/s) into ground-frame m/s.
 * sx: right on screen, sy: down on screen (ball going up → sy < 0).
 */
export function screenToGround(
  sxPxPerSec: number,
  syPxPerSec: number,
  mmPerPixel: number,
): GroundVelocity {
  const sx = sxPxPerSec * mmPerPixel * MM_TO_M;
  const sy = syPxPerSec * mmPerPixel * MM_TO_M;

  const sinA = SIN_A;
  const cosA = COS_A;
  const phi = CORNER_DOWNRANGE_PITCH;

  // sx = lateral * cosA + downrange * sinA
  // sy = -vertical + downrange * cosA * phi
  const denom = sinA * sinA + cosA * cosA * phi * phi;
  const downrangeMps = Math.max(0, (sx * sinA + -sy * cosA * phi) / Math.max(denom, 0.01));
  const lateralMps = (sx - downrangeMps * sinA) / Math.max(cosA, 0.05);
  const verticalMps = Math.max(0, -sy + downrangeMps * cosA * phi);

  return { lateralMps, downrangeMps, verticalMps };
}

function groundToMetrics(g: GroundVelocity): {
  ballSpeedMph: number;
  launchAngleDeg: number;
  directionDeg: number;
} {
  const horiz = Math.hypot(g.lateralMps, g.downrangeMps);
  const speedMps = Math.hypot(horiz, g.verticalMps);
  const launchAngleDeg = (Math.atan2(g.verticalMps, Math.max(horiz, 0.01)) * 180) / Math.PI;
  const directionDeg = (Math.atan2(g.lateralMps, Math.max(g.downrangeMps, 0.01)) * 180) / Math.PI;
  return {
    ballSpeedMph: speedMps * MPS_TO_MPH,
    launchAngleDeg,
    directionDeg,
  };
}

/** Median of numeric array. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * Full corner analysis: regression + early pairwise speeds, merged via median.
 */
export function analyzeCornerFlight(
  track: TrackPoint[],
  mmPerPixel: number,
): CornerFlight | null {
  if (track.length < 3) return null;

  const regression = fitScreenVelocity(track);
  const pairs = earlyPairwiseVelocities(track);

  const grounds: GroundVelocity[] = [];
  if (regression) {
    grounds.push(screenToGround(regression.vx, regression.vy, mmPerPixel));
  }
  for (const p of pairs) {
    grounds.push(screenToGround(p.vx, p.vy, mmPerPixel));
  }
  if (grounds.length === 0) return null;

  const merged: GroundVelocity = {
    lateralMps: median(grounds.map((g) => g.lateralMps)),
    downrangeMps: median(grounds.map((g) => g.downrangeMps)),
    verticalMps: median(grounds.map((g) => g.verticalMps)),
  };

  // Favor peak early speed for ball speed (first pairwise often highest).
  const speeds = pairs.map((p) => {
    const g = screenToGround(p.vx, p.vy, mmPerPixel);
    return Math.hypot(g.lateralMps, g.downrangeMps, g.verticalMps) * MPS_TO_MPH;
  });
  const peakSpeed = speeds.length > 0 ? Math.max(...speeds) : 0;
  const metrics = groundToMetrics(merged);
  const ballSpeedMph =
    peakSpeed > 0
      ? peakSpeed * 0.65 + metrics.ballSpeedMph * 0.35
      : metrics.ballSpeedMph;

  if (!Number.isFinite(ballSpeedMph) || ballSpeedMph <= 0) return null;

  return {
    ballSpeedMph,
    launchAngleDeg: metrics.launchAngleDeg,
    directionDeg: metrics.directionDeg,
    ground: merged,
  };
}

/** Improved ball speed from early flight segments (any angle). */
export function ballSpeedFromEarlyTrack(
  track: TrackPoint[],
  fps: number,
  mmPerPixel: number,
): number | null {
  if (track.length < 2 || fps <= 0) return null;
  const speeds: number[] = [];
  const limit = Math.min(4, track.length - 1);
  for (let i = 0; i < limit; i++) {
    const a = track[i]!;
    const b = track[i + 1]!;
    const dx = (b.px - a.px) * mmPerPixel * MM_TO_M;
    const dy = (b.py - a.py) * mmPerPixel * MM_TO_M;
    const dt = Math.max(b.t - a.t, 1 / fps);
    speeds.push((Math.hypot(dx, dy) / dt) * MPS_TO_MPH);
  }
  if (speeds.length === 0) return null;
  // Blend median with peak early frame (impact blur often on frame 1).
  const med = median(speeds);
  const peak = Math.max(...speeds);
  return peak * 0.55 + med * 0.45;
}
