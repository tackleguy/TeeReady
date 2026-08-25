/** Landmark indices and geometric helpers for MediaPipe Pose (33 landmarks). */

import type { Handedness, LandmarkPoint, PoseFrame } from './types';

export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** Body joints used for visibility / quality (skip face detail). */
export const BODY_LANDMARK_IDS = [
  LM.nose,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
] as const;

export function leadWristIndex(handedness: Handedness): number {
  // Right-handed: lead = left wrist; left-handed: lead = right wrist.
  return handedness === 'right' ? LM.leftWrist : LM.rightWrist;
}

export function trailWristIndex(handedness: Handedness): number {
  return handedness === 'right' ? LM.rightWrist : LM.leftWrist;
}

export function leadShoulderIndex(handedness: Handedness): number {
  return handedness === 'right' ? LM.leftShoulder : LM.rightShoulder;
}

export function trailShoulderIndex(handedness: Handedness): number {
  return handedness === 'right' ? LM.rightShoulder : LM.leftShoulder;
}

export function leadHipIndex(handedness: Handedness): number {
  return handedness === 'right' ? LM.leftHip : LM.rightHip;
}

export function trailHipIndex(handedness: Handedness): number {
  return handedness === 'right' ? LM.rightHip : LM.leftHip;
}

export function leadElbowIndex(handedness: Handedness): number {
  return handedness === 'right' ? LM.leftElbow : LM.rightElbow;
}

export function midPoint(
  a: LandmarkPoint,
  b: LandmarkPoint,
): { x: number; y: number; z: number } {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  };
}

export function dist2d(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function shoulderWidth(landmarks: LandmarkPoint[]): number {
  const w = dist2d(landmarks[LM.leftShoulder], landmarks[LM.rightShoulder]);
  return Math.max(w, 1e-4);
}

export function hipCenter(landmarks: LandmarkPoint[]) {
  return midPoint(landmarks[LM.leftHip], landmarks[LM.rightHip]);
}

export function shoulderCenter(landmarks: LandmarkPoint[]) {
  return midPoint(landmarks[LM.leftShoulder], landmarks[LM.rightShoulder]);
}

/** Angle of vector a→b from vertical-up in image space (y down). Degrees. */
export function angleFromVertical(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Vertical up in image = (0, -1). Angle between (dx,dy) and (0,-1).
  const mag = Math.hypot(dx, dy) || 1e-6;
  const cos = (-dy) / mag;
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Signed rotation of a segment around vertical (for turn estimates). Degrees. */
export function segmentYaw(
  left: { x: number; z: number },
  right: { x: number; z: number },
): number {
  const dx = right.x - left.x;
  const dz = right.z - left.z;
  return (Math.atan2(dz, dx) * 180) / Math.PI;
}

export function bodyMeanVisibility(landmarks: LandmarkPoint[]): number {
  let sum = 0;
  for (const id of BODY_LANDMARK_IDS) {
    sum += landmarks[id]?.visibility ?? 0;
  }
  return sum / BODY_LANDMARK_IDS.length;
}

export function leadWristSeries(
  frames: PoseFrame[],
  handedness: Handedness,
): { y: number; t: number; vis: number }[] {
  const idx = leadWristIndex(handedness);
  return frames.map((f) => ({
    y: f.landmarks[idx].y,
    t: f.t,
    vis: f.landmarks[idx].visibility,
  }));
}

/** Finite-difference velocity of lead wrist y (image space; negative = rising). */
export function leadWristVelocity(
  frames: PoseFrame[],
  handedness: Handedness,
): number[] {
  const series = leadWristSeries(frames, handedness);
  const v: number[] = new Array(series.length).fill(0);
  for (let i = 1; i < series.length; i++) {
    const dt = series[i].t - series[i - 1].t;
    if (dt <= 0) {
      v[i] = 0;
      continue;
    }
    v[i] = (series[i].y - series[i - 1].y) / dt;
  }
  if (series.length > 1) v[0] = v[1];
  return v;
}

export function smooth(values: number[], window = 5): number[] {
  const half = Math.floor(window / 2);
  const out = new Array(values.length);
  for (let i = 0; i < values.length; i++) {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < values.length) {
        sum += values[j];
        n += 1;
      }
    }
    out[i] = sum / n;
  }
  return out;
}
