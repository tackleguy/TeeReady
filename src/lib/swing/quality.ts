/** Capture quality gates — reject bad input rather than analyse it. */

import { BODY_LANDMARK_IDS, dist2d, shoulderWidth } from './geometry';
import { SWING_THRESHOLDS } from './thresholds';
import type { CaptureQuality, PoseFrame } from './types';

function frameInFrame(frame: PoseFrame): boolean {
  // Core joints should sit inside a padded viewport.
  const pad = 0.02;
  const ids = [
    ...BODY_LANDMARK_IDS.filter((id) => id !== 0),
  ];
  let inside = 0;
  for (const id of ids) {
    const p = frame.landmarks[id];
    if (!p) continue;
    if (
      p.x >= pad &&
      p.x <= 1 - pad &&
      p.y >= pad &&
      p.y <= 1 - pad &&
      p.visibility >= 0.4
    ) {
      inside += 1;
    }
  }
  return inside / ids.length >= 0.6;
}

function shoulderSpanOk(frame: PoseFrame): boolean {
  // Too far: shoulders occupy a tiny fraction of the frame.
  const w = shoulderWidth(frame.landmarks);
  return w >= 0.08;
}

function estimateDarkness(frames: PoseFrame[]): boolean {
  // Proxy: very low visibility often means underexposure / silhouette.
  const mean =
    frames.reduce((s, f) => s + f.meanVisibility, 0) / Math.max(frames.length, 1);
  return mean < SWING_THRESHOLDS.minMeanVisibility * 0.85;
}

function hasFlicker(frames: PoseFrame[]): boolean {
  if (frames.length < 3) return false;
  let jumps = 0;
  let checked = 0;
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const sw = shoulderWidth(a.landmarks);
    const dt = Math.max(b.t - a.t, 1 / 120);
    // Normalise jump by shoulder width and expected motion per second.
    for (const id of [11, 12, 23, 24, 15, 16] as const) {
      const d = dist2d(a.landmarks[id], b.landmarks[id]) / sw;
      const rate = d / dt;
      checked += 1;
      // Implausible: > ~8 shoulder-widths / second for torso joints.
      if (rate > 8) jumps += 1;
    }
  }
  return checked > 0 && jumps / checked > 0.12;
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
        'Couldn’t lock onto a clear full-body pose. Stand farther so head-to-feet are visible, and face the camera for the chosen angle.',
    };
  }

  const meanVis =
    frames.reduce((s, f) => s + f.meanVisibility, 0) / frames.length;
  if (meanVis < SWING_THRESHOLDS.minMeanVisibility) {
    return {
      ok: false,
      reason: 'obstructed',
      message:
        'Landmarks are too uncertain — something may be blocking the body, or the camera angle is wrong for a full swing.',
    };
  }

  const inFrameRatio =
    frames.filter(frameInFrame).length / frames.length;
  if (inFrameRatio < 0.65) {
    return {
      ok: false,
      reason: 'out-of-frame',
      message:
        'You drifted out of frame. Keep head and feet inside the guide for the whole swing.',
    };
  }

  const farRatio = frames.filter((f) => !shoulderSpanOk(f)).length / frames.length;
  if (farRatio > 0.5) {
    return {
      ok: false,
      reason: 'too-far',
      message:
        'You’re too far from the camera (or too small in frame). Step closer so the torso fills the guide.',
    };
  }

  if (hasFlicker(frames)) {
    return {
      ok: false,
      reason: 'flicker',
      message:
        'Pose jumped around between frames — often caused by occlusion, a second person, or a shaky camera. Re-record with a steady phone.',
    };
  }

  return { ok: true };
}
