/** Capture quality gates — frame count and pose coverage only. */

import { SWING_THRESHOLDS } from './thresholds';
import type { CaptureQuality, PoseFrame } from './types';

function estimateDarkness(frames: PoseFrame[]): boolean {
  const mean =
    frames.reduce((s, f) => s + f.meanVisibility, 0) / Math.max(frames.length, 1);
  return mean < SWING_THRESHOLDS.minMeanVisibility * 0.85;
}

export function assessCaptureQuality(frames: PoseFrame[]): CaptureQuality {
  if (frames.length < SWING_THRESHOLDS.minFrames) {
    return {
      ok: false,
      reason: 'too-short',
      message:
        'Clip is too short to find a full swing. Record address through finish (~2–4 seconds).',
    };
  }

  const usable = frames.filter((f) => f.meanVisibility >= 0.35);
  if (usable.length / frames.length < SWING_THRESHOLDS.minPoseFrameRatio) {
    if (estimateDarkness(frames)) {
      return {
        ok: false,
        reason: 'too-dark',
        message:
          'Pose was hard to see — lighting looks too dark or the player is silhouetted. Move to brighter light and try again.',
      };
    }
    return {
      ok: false,
      reason: 'no-pose',
      message:
        'Couldn’t track enough frames with a clear body pose. Record a full swing with you in view the whole time.',
    };
  }

  return { ok: true };
}
