/** Angle-valid geometric metrics from pose keypoints. */

import {
  LM,
  angleFromVertical,
  hipCenter,
  leadElbowIndex,
  leadHipIndex,
  leadShoulderIndex,
  leadWristIndex,
  segmentYaw,
  shoulderCenter,
  shoulderWidth,
  trailHipIndex,
  trailShoulderIndex,
} from './geometry';
import { SWING_THRESHOLDS } from './thresholds';
import type {
  CameraAngle,
  Handedness,
  KeyPositions,
  PoseFrame,
  SwingMetric,
} from './types';

function confidenceFor(fps: number, validAtFps: number): 'high' | 'low' {
  return fps >= validAtFps ? 'high' : 'low';
}

function metric(
  partial: Omit<SwingMetric, 'confidence'> & { fps: number },
): SwingMetric {
  const { fps, ...rest } = partial;
  return {
    ...rest,
    confidence: confidenceFor(fps, rest.validAtFps),
  };
}

function faceOnMetrics(
  frames: PoseFrame[],
  pos: KeyPositions,
  handedness: Handedness,
  fps: number,
): SwingMetric[] {
  const t = SWING_THRESHOLDS;
  const addr = frames[pos.p1].landmarks;
  const top = frames[pos.p4].landmarks;
  const impact = frames[pos.p7].landmarks;
  const sw = shoulderWidth(addr);

  const headAddr = addr[LM.nose];
  const headImpact = impact[LM.nose];
  const headLateral = Math.abs(headImpact.x - headAddr.x) / sw;

  const hipAddr = hipCenter(addr);
  const hipTop = hipCenter(top);
  const hipImpact = hipCenter(impact);
  const hipSway = Math.abs(hipTop.x - hipAddr.x) / sw;
  const hipSlide = Math.abs(hipImpact.x - hipAddr.x) / sw;
  const weightShift = (hipImpact.x - hipAddr.x) / sw;

  const leadSh = top[leadShoulderIndex(handedness)];
  const leadEl = top[leadElbowIndex(handedness)];
  const leadWr = top[leadWristIndex(handedness)];
  // Angle at elbow: shoulder–elbow–wrist, reported as arm fold from upper arm to forearm.
  const v1x = leadSh.x - leadEl.x;
  const v1y = leadSh.y - leadEl.y;
  const v2x = leadWr.x - leadEl.x;
  const v2y = leadWr.y - leadEl.y;
  const m1 = Math.hypot(v1x, v1y) || 1e-6;
  const m2 = Math.hypot(v2x, v2y) || 1e-6;
  const leadArmAngle =
    (Math.acos(Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (m1 * m2)))) *
      180) /
    Math.PI;

  const backFrames = Math.max(1, pos.p4 - pos.p1);
  const downFrames = Math.max(1, pos.p7 - pos.p4);
  const tempo = backFrames / downFrames;

  return [
    metric({
      id: 'head_lateral',
      label: 'Head lateral move (P1→P7)',
      value: round(headLateral, 3),
      unit: 'shoulder widths',
      validAtFps: t.impactMetricMinFps,
      angle: 'face-on',
      fps,
    }),
    metric({
      id: 'hip_sway',
      label: 'Hip sway at top',
      value: round(hipSway, 3),
      unit: 'shoulder widths',
      validAtFps: 30,
      angle: 'face-on',
      fps,
    }),
    metric({
      id: 'hip_slide',
      label: 'Hip slide at impact',
      value: round(hipSlide, 3),
      unit: 'shoulder widths',
      validAtFps: t.impactMetricMinFps,
      angle: 'face-on',
      fps,
    }),
    metric({
      id: 'weight_shift',
      label: 'Weight-shift proxy (hip centre)',
      value: round(weightShift, 3),
      unit: 'shoulder widths',
      validAtFps: t.impactMetricMinFps,
      angle: 'face-on',
      fps,
    }),
    metric({
      id: 'lead_arm_p4',
      label: 'Lead-arm angle at P4',
      value: round(leadArmAngle, 1),
      unit: '°',
      validAtFps: 30,
      angle: 'face-on',
      fps,
    }),
    metric({
      id: 'tempo_ratio',
      label: 'Tempo (backswing ÷ downswing)',
      value: round(tempo, 2),
      unit: ':1',
      validAtFps: 30,
      angle: 'face-on',
      fps,
    }),
  ];
}

function dtlMetrics(
  frames: PoseFrame[],
  pos: KeyPositions,
  handedness: Handedness,
  fps: number,
): SwingMetric[] {
  const t = SWING_THRESHOLDS;
  const addr = frames[pos.p1].landmarks;
  const top = frames[pos.p4].landmarks;
  const impact = frames[pos.p7].landmarks;
  const sw = shoulderWidth(addr);

  const spineAt = (lm: typeof addr) =>
    angleFromVertical(hipCenter(lm), shoulderCenter(lm));

  const spineP1 = spineAt(addr);
  const spineP7 = spineAt(impact);
  const earlyExt = spineP1 - spineP7; // positive = stood up (early extension)

  const shoulderTurn = Math.abs(
    segmentYaw(
      {
        x: top[trailShoulderIndex(handedness)].x,
        z: top[trailShoulderIndex(handedness)].z,
      },
      {
        x: top[leadShoulderIndex(handedness)].x,
        z: top[leadShoulderIndex(handedness)].z,
      },
    ) -
      segmentYaw(
        {
          x: addr[trailShoulderIndex(handedness)].x,
          z: addr[trailShoulderIndex(handedness)].z,
        },
        {
          x: addr[leadShoulderIndex(handedness)].x,
          z: addr[leadShoulderIndex(handedness)].z,
        },
      ),
  );

  const hipTurn = Math.abs(
    segmentYaw(
      {
        x: top[trailHipIndex(handedness)].x,
        z: top[trailHipIndex(handedness)].z,
      },
      {
        x: top[leadHipIndex(handedness)].x,
        z: top[leadHipIndex(handedness)].z,
      },
    ) -
      segmentYaw(
        {
          x: addr[trailHipIndex(handedness)].x,
          z: addr[trailHipIndex(handedness)].z,
        },
        {
          x: addr[leadHipIndex(handedness)].x,
          z: addr[leadHipIndex(handedness)].z,
        },
      ),
  );

  const xFactor = Math.abs(shoulderTurn - hipTurn);

  const headDepth =
    Math.abs(impact[LM.nose].z - addr[LM.nose].z) / Math.max(sw, 1e-4);

  return [
    metric({
      id: 'spine_address',
      label: 'Spine angle at address',
      value: round(spineP1, 1),
      unit: '°',
      validAtFps: 30,
      angle: 'dtl',
      fps,
    }),
    metric({
      id: 'early_extension',
      label: 'Spine change P1→P7 (early extension)',
      value: round(earlyExt, 1),
      unit: '°',
      validAtFps: t.impactMetricMinFps,
      angle: 'dtl',
      fps,
    }),
    metric({
      id: 'shoulder_turn_p4',
      label: 'Shoulder turn at P4',
      value: round(shoulderTurn, 1),
      unit: '°',
      validAtFps: 30,
      angle: 'dtl',
      fps,
    }),
    metric({
      id: 'hip_turn_p4',
      label: 'Hip turn at P4',
      value: round(hipTurn, 1),
      unit: '°',
      validAtFps: 30,
      angle: 'dtl',
      fps,
    }),
    metric({
      id: 'x_factor',
      label: 'X-factor at P4',
      value: round(xFactor, 1),
      unit: '°',
      validAtFps: 30,
      angle: 'dtl',
      fps,
    }),
    metric({
      id: 'head_depth',
      label: 'Head depth change P1→P7',
      value: round(headDepth, 3),
      unit: 'shoulder widths',
      validAtFps: t.impactMetricMinFps,
      angle: 'dtl',
      fps,
    }),
  ];
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

export function computeMetrics(
  frames: PoseFrame[],
  pos: KeyPositions,
  angle: CameraAngle,
  handedness: Handedness,
  fps: number,
): SwingMetric[] {
  if (angle === 'face-on') {
    return faceOnMetrics(frames, pos, handedness, fps);
  }
  return dtlMetrics(frames, pos, handedness, fps);
}
