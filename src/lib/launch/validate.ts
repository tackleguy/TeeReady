/** Setup and upload validation for launch clips. */

import {
  LM_TIER_MIN_FPS,
  MIN_CLIP_DURATION_S,
  MIN_SAMPLED_FRAMES,
  MIN_TRACK_POINTS,
} from './constants';
import type { SampledFrame } from './frames';
import type { TrackPoint } from './types';

export type SetupValidation = {
  warnings: string[];
  errors: string[];
  ok: boolean;
};

export function validateSetup(
  fps: number,
  duration: number,
  frameCount: number,
  track: TrackPoint[],
  angle: 'face-on' | 'dtl',
): SetupValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (duration < MIN_CLIP_DURATION_S) {
    errors.push(`Clip too short (${duration.toFixed(1)}s). Need at least ${MIN_CLIP_DURATION_S}s.`);
  }

  if (frameCount < MIN_SAMPLED_FRAMES) {
    errors.push(`Too few frames sampled (${frameCount}).`);
  }

  if (fps < LM_TIER_MIN_FPS) {
    warnings.push(
      `Measured ~${Math.round(fps)} fps — below ${LM_TIER_MIN_FPS} fps launch-monitor tier. Record in native Camera slow-mo (120/240 fps).`,
    );
  }

  if (track.length < MIN_TRACK_POINTS) {
    errors.push(
      `Only ${track.length} post-impact track points (need ≥${MIN_TRACK_POINTS}). Keep ball in frame after impact.`,
    );
  }

  if (angle === 'face-on') {
    warnings.push('Face-on: launch angle and carry available; launch direction is not measurable.');
  } else {
    warnings.push('Down-the-line: speed along line only; launch angle is not reported.');
  }

  return {
    warnings,
    errors,
    ok: errors.length === 0,
  };
}

export function inferCameraAngleFromTrack(track: TrackPoint[]): 'face-on' | 'dtl' {
  if (track.length < 3) return 'face-on';
  let dxSum = 0;
  let dySum = 0;
  for (let i = 1; i < track.length; i++) {
    dxSum += Math.abs(track[i]!.px - track[i - 1]!.px);
    dySum += Math.abs(track[i]!.py - track[i - 1]!.py);
  }
  // Face-on: ball moves mostly vertically on screen; DTL: mostly horizontal.
  return dxSum > dySum * 1.2 ? 'dtl' : 'face-on';
}

export function validatePreImpactBall(frames: SampledFrame[], impactIndex: number): string | null {
  const pre = frames.slice(Math.max(0, impactIndex - 5), impactIndex);
  if (pre.length === 0) return 'No pre-impact frames for ball calibration.';
  return null;
}
