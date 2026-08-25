/** Geometric swing segmentation: P1, P4, P7, P10 from lead-wrist motion. */

import { leadWristSeries, leadWristVelocity, smooth } from './geometry';
import type { Handedness, KeyPositions, PoseFrame } from './types';

function argMax(values: number[], from: number, to: number): number {
  let best = from;
  let bestV = -Infinity;
  for (let i = from; i <= to; i++) {
    if (values[i] > bestV) {
      bestV = values[i];
      best = i;
    }
  }
  return best;
}

function argMin(values: number[], from: number, to: number): number {
  let best = from;
  let bestV = Infinity;
  for (let i = from; i <= to; i++) {
    if (values[i] < bestV) {
      bestV = values[i];
      best = i;
    }
  }
  return best;
}

/**
 * Detect key positions from lead-wrist height (image y; lower = higher in frame)
 * and vertical velocity.
 */
export function segmentSwing(
  frames: PoseFrame[],
  handedness: Handedness,
): KeyPositions | null {
  if (frames.length < 12) return null;

  const series = leadWristSeries(frames, handedness);
  const yRaw = series.map((s) => s.y);
  const y = smooth(yRaw, 5);
  const v = smooth(leadWristVelocity(frames, handedness), 5);

  // Baseline address height: median of first ~15% of frames.
  const addrEnd = Math.max(3, Math.floor(frames.length * 0.15));
  const addrSlice = y.slice(0, addrEnd).sort((a, b) => a - b);
  const addressY = addrSlice[Math.floor(addrSlice.length / 2)];

  // Motion onset (P1): first frame where |v| exceeds a fraction of peak later motion.
  const peakAbsV = Math.max(...v.map(Math.abs), 1e-6);
  const onsetThresh = Math.max(0.15 * peakAbsV, 0.08);
  let p1 = 0;
  for (let i = 1; i < frames.length; i++) {
    if (Math.abs(v[i]) > onsetThresh) {
      p1 = Math.max(0, i - 1);
      break;
    }
  }

  // P4 top: minimum y (highest in frame) after P1 in the first 70% of the swing.
  const searchEnd = Math.max(p1 + 3, Math.floor(frames.length * 0.75));
  let p4 = argMin(y, p1, searchEnd);

  // Prefer a velocity zero-crossing near the height peak (backswing → downswing).
  for (let i = Math.max(p1 + 2, p4 - 4); i <= Math.min(searchEnd, p4 + 8); i++) {
    if (v[i - 1] < 0 && v[i] >= 0) {
      // Rising then falling in image-y? Backswing raises wrist (y decreases, v<0),
      // then downswing lowers wrist (y increases, v>0). Zero cross -→+ near top.
      p4 = i;
      break;
    }
  }
  // Re-check height peak in a small window around the crossing.
  p4 = argMin(y, Math.max(p1, p4 - 6), Math.min(searchEnd, p4 + 6));

  // P7 impact: after P4, peak downswing velocity (max positive v) near address height.
  const afterTop = p4 + 1;
  if (afterTop >= frames.length - 2) return null;

  let p7 = argMax(v, afterTop, frames.length - 1);
  // Prefer candidate where wrist y is closest to address among high-velocity frames.
  const vPeak = v[p7];
  const vCut = vPeak * 0.55;
  let bestImpact = p7;
  let bestScore = Infinity;
  for (let i = afterTop; i < frames.length; i++) {
    if (v[i] < vCut) continue;
    const heightErr = Math.abs(y[i] - addressY);
    const score = heightErr - 0.15 * (v[i] / (vPeak || 1));
    if (score < bestScore) {
      bestScore = score;
      bestImpact = i;
    }
  }
  p7 = bestImpact;

  // P10 finish: after impact, motion settles (|v| low) and wrist stays high or level.
  let p10 = frames.length - 1;
  const settleThresh = Math.max(0.12 * peakAbsV, 0.05);
  let settled = 0;
  for (let i = p7 + 1; i < frames.length; i++) {
    if (Math.abs(v[i]) < settleThresh) {
      settled += 1;
      if (settled >= 3) {
        p10 = i;
        break;
      }
    } else {
      settled = 0;
    }
  }

  if (!(p1 < p4 && p4 < p7 && p7 <= p10)) return null;

  return { p1, p4, p7, p10 };
}
