/** Setup and upload validation for launch clips. */

import {
  IDEAL_SETUP_SUMMARY,
  LM_NUMBERS_MIN_FPS,
  LM_TIER_MIN_FPS,
  MIN_CLIP_DURATION_S,
  MIN_SAMPLED_FRAMES,
  MIN_TRACK_POINTS,
} from './constants';
import { fpsSetupWarning } from './accuracy';
import type { SampledFrame } from './frames';
import type { CameraAngle, TrackPoint } from './types';

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
  angle: CameraAngle,
): SetupValidation {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (angle === 'corner') {
    warnings.push(`Ideal setup: ${IDEAL_SETUP_SUMMARY}`);
  }

  if (duration < MIN_CLIP_DURATION_S) {
    errors.push(`Clip too short (${duration.toFixed(1)}s). Need at least ${MIN_CLIP_DURATION_S}s.`);
  }

  if (frameCount < MIN_SAMPLED_FRAMES) {
    errors.push(`Too few frames sampled (${frameCount}).`);
  }

  const fpsWarning = fpsSetupWarning(fps);
  if (fpsWarning) warnings.push(fpsWarning);

  if (fps < LM_NUMBERS_MIN_FPS) {
    warnings.push(
      `Below ${LM_NUMBERS_MIN_FPS} fps — shot tracer only; yardage numbers are not shown.`,
    );
  } else if (fps < LM_TIER_MIN_FPS) {
    warnings.push(
      `30–119 fps clips are supported at reduced accuracy. 120+ fps slow-mo gives the best tracer and yardage.`,
    );
  }

  if (track.length < MIN_TRACK_POINTS) {
    errors.push(
      `Only ${track.length} post-impact track points (need ≥${MIN_TRACK_POINTS}). Keep ball in frame after impact.`,
    );
  }

  if (angle === 'face-on') {
    warnings.push('Face-on: launch angle and carry available; launch direction is not measurable.');
  } else if (angle === 'dtl') {
    warnings.push('Down-the-line: speed along line only; launch angle is not reported.');
  } else {
    warnings.push(
      'Corner: estimated launch angle, start direction, and carry — best at 6–10 ft behind, ~45° off line.',
    );
  }

  return {
    warnings,
    errors,
    ok: errors.length === 0,
  };
}

export function inferCameraAngleFromTrack(track: TrackPoint[]): CameraAngle {
  if (track.length < 3) return 'corner';
  let dxSum = 0;
  let dySum = 0;
  for (let i = 1; i < track.length; i++) {
    dxSum += Math.abs(track[i]!.px - track[i - 1]!.px);
    dySum += Math.abs(track[i]!.py - track[i - 1]!.py);
  }
  const ratio = dxSum / Math.max(dySum, 0.001);
  if (ratio > 2) return 'dtl';
  if (ratio < 0.5) return 'face-on';
  return 'corner';
}

export function validatePreImpactBall(frames: SampledFrame[], impactIndex: number): string | null {
  const pre = frames.slice(Math.max(0, impactIndex - 5), impactIndex);
  if (pre.length === 0) return 'No pre-impact frames for ball calibration.';
  return null;
}

export function angleLabel(angle: CameraAngle): string {
  if (angle === 'corner') return 'Corner (6–10 ft behind)';
  if (angle === 'dtl') return 'Down-the-line';
  return 'Face-on';
}
