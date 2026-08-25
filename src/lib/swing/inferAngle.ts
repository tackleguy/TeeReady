/** Infer face-on vs down-the-line from pose geometry — no user setup required. */

import {
  dist2d,
  hipCenter,
  LM,
  shoulderCenter,
  shoulderWidth,
} from './geometry';
import type { CameraAngle, PoseFrame } from './types';

/**
 * Face-on: shoulders appear wide in the image; DTL: shoulders stack and depth
 * separation dominates. Uses address-ish frames for a stable read.
 */
export function inferCameraAngle(frames: PoseFrame[]): CameraAngle | null {
  const usable = frames.filter((f) => f.meanVisibility >= 0.35);
  if (usable.length < 5) return null;

  const addrEnd = Math.max(5, Math.floor(usable.length * 0.2));
  const sample = usable.slice(0, addrEnd);

  let scoreSum = 0;
  let n = 0;
  for (const f of sample) {
    const lm = f.landmarks;
    const sw = shoulderWidth(lm);
    const sh = shoulderCenter(lm);
    const hip = hipCenter(lm);
    const torsoH = Math.max(dist2d(sh, hip), 0.05);
    const widthRatio = sw / torsoH;

    const ls = lm[LM.leftShoulder];
    const rs = lm[LM.rightShoulder];
    const depthRatio = Math.abs(ls.z - rs.z) / sw;

    // Higher → more face-on; lower → more down-the-line.
    scoreSum += widthRatio - depthRatio * 0.35;
    n += 1;
  }
  if (!n) return null;
  return scoreSum / n >= 0.42 ? 'face-on' : 'dtl';
}

export function angleLabel(angle: CameraAngle): string {
  return angle === 'dtl' ? 'down-the-line' : 'face-on';
}
