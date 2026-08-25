/**
 * Integration smoke for swing Phase 1–2B (no camera).
 * Run: npx tsx scripts/smoke-swing.ts
 */

import assert from 'node:assert/strict';
import { DEFAULT_PROFILE } from '../src/lib/golfProfile';
import { computeMetrics } from '../src/lib/swing/metrics';
import { assessCaptureQuality } from '../src/lib/swing/quality';
import { inferCameraAngle } from '../src/lib/swing/inferAngle';
import { SWING_THRESHOLDS } from '../src/lib/swing/thresholds';
import { buildSwingGuide } from '../src/lib/swing/guide/assemble';
import { buildSwingPlan } from '../src/lib/swingPlan';
import type { LandmarkPoint, PoseFrame, SwingAnalysis } from '../src/lib/swing/types';

function lm(vis = 0.9): LandmarkPoint {
  return { x: 0.5, y: 0.5, z: 0, visibility: vis };
}

function frameAt(
  t: number,
  patch: Partial<Record<number, Partial<LandmarkPoint>>>,
): PoseFrame {
  const landmarks: LandmarkPoint[] = Array.from({ length: 33 }, () => lm());
  // shoulders + hips baseline
  landmarks[11] = { x: 0.4, y: 0.35, z: 0, visibility: 0.95 };
  landmarks[12] = { x: 0.6, y: 0.35, z: 0, visibility: 0.95 };
  landmarks[23] = { x: 0.42, y: 0.55, z: 0, visibility: 0.95 };
  landmarks[24] = { x: 0.58, y: 0.55, z: 0, visibility: 0.95 };
  landmarks[15] = { x: 0.38, y: 0.5, z: 0, visibility: 0.95 }; // lead wrist RH
  landmarks[16] = { x: 0.62, y: 0.5, z: 0, visibility: 0.95 };
  landmarks[0] = { x: 0.5, y: 0.2, z: 0, visibility: 0.95 };
  for (const [id, p] of Object.entries(patch)) {
    const i = Number(id);
    landmarks[i] = { ...landmarks[i]!, ...p };
  }
  const meanVisibility =
    landmarks.reduce((s, p) => s + p.visibility, 0) / landmarks.length;
  return { t, landmarks, meanVisibility };
}

// --- 30 fps gate ---
assert.equal(SWING_THRESHOLDS.impactMetricMinFps, 30);
assert.equal(SWING_THRESHOLDS.warnBelowFps, 30);

const positions = { p1: 0, p4: 10, p7: 18, p10: 28 };
const frames: PoseFrame[] = [];
for (let i = 0; i < 30; i++) {
  const phase = i / 29;
  // wrist rises (y down) then drops through impact
  const y =
    phase < 0.35
      ? 0.5 - phase * 0.6
      : phase < 0.6
        ? 0.29 + (phase - 0.35) * 0.9
        : 0.5;
  frames.push(
    frameAt(i / 30, {
      15: { y, x: 0.38 + phase * 0.05 },
      11: { y: 0.35, z: -0.05 },
      12: { y: 0.35, z: 0.1 + phase * 0.05 },
    }),
  );
}

const metrics30 = computeMetrics(frames, positions, 'dtl', 'right', 30);
const impact = metrics30.filter((m) =>
  ['early_extension', 'head_depth'].includes(m.id),
);
assert.ok(impact.length >= 1);
for (const m of impact) {
  assert.equal(
    m.confidence,
    'high',
    `${m.id} should be high confidence at 30fps (validAtFps=${m.validAtFps})`,
  );
}
console.log('PASS: impact metrics high-confidence at 30 fps');

const metrics29 = computeMetrics(frames, positions, 'dtl', 'right', 29);
for (const m of metrics29.filter((x) => x.validAtFps === 30)) {
  assert.equal(m.confidence, 'low', `${m.id} low below 30`);
}
console.log('PASS: impact metrics low-confidence at 29 fps');

// --- quality: frame coverage only (zoom/angle no longer reject) ---
const badFrames = Array.from({ length: 25 }, (_, i) =>
  frameAt(i / 30, {
    11: { x: 0.49, y: 0.5, visibility: 0.2 },
    12: { x: 0.51, y: 0.5, visibility: 0.2 },
    15: { visibility: 0.1 },
  }),
).map((f) => ({
  ...f,
  meanVisibility: 0.25,
  landmarks: f.landmarks.map((p) => ({ ...p, visibility: 0.25 })),
}));
const quality = assessCaptureQuality(badFrames);
assert.equal(quality.ok, false);
console.log('PASS: bad capture rejected —', !quality.ok && quality.reason);

const farVisible = Array.from({ length: 25 }, (_, i) =>
  frameAt(i / 30, {
    11: { x: 0.49, y: 0.5, visibility: 0.9 },
    12: { x: 0.51, y: 0.5, visibility: 0.9 },
  }),
);
assert.equal(assessCaptureQuality(farVisible).ok, true);
console.log('PASS: small/zoomed subject passes when pose frames are tracked');

const faceOnFrames = Array.from({ length: 25 }, (_, i) => frameAt(i / 30, {}));
assert.equal(inferCameraAngle(faceOnFrames), 'face-on');
const dtlFrames = Array.from({ length: 25 }, (_, i) =>
  frameAt(i / 30, {
    11: { x: 0.48, y: 0.35, z: -0.25, visibility: 0.95 },
    12: { x: 0.52, y: 0.35, z: 0.25, visibility: 0.95 },
  }),
);
assert.equal(inferCameraAngle(dtlFrames), 'dtl');
console.log('PASS: camera angle inferred from pose geometry');

// --- plan + guide at 30fps analysis ---
const analysis: SwingAnalysis = {
  id: 'smoke-30fps',
  createdAt: Date.now(),
  angle: 'dtl',
  handedness: 'right',
  fps: 30,
  positions,
  metrics: [
    {
      id: 'early_extension',
      label: 'Spine change P1→P7',
      value: 14,
      unit: '°',
      confidence: 'high',
      validAtFps: 30,
      angle: 'dtl',
    },
    {
      id: 'spine_address',
      label: 'Spine angle at address',
      value: 34,
      unit: '°',
      confidence: 'high',
      validAtFps: 30,
      angle: 'dtl',
    },
    {
      id: 'shoulder_turn_p4',
      label: 'Shoulder turn at P4',
      value: 85,
      unit: '°',
      confidence: 'high',
      validAtFps: 30,
      angle: 'dtl',
    },
    {
      id: 'hip_turn_p4',
      label: 'Hip turn at P4',
      value: 40,
      unit: '°',
      confidence: 'high',
      validAtFps: 30,
      angle: 'dtl',
    },
    {
      id: 'x_factor',
      label: 'X-factor at P4',
      value: 45,
      unit: '°',
      confidence: 'high',
      validAtFps: 30,
      angle: 'dtl',
    },
    {
      id: 'head_depth',
      label: 'Head depth',
      value: 0.03,
      unit: 'shoulder widths',
      confidence: 'high',
      validAtFps: 30,
      angle: 'dtl',
    },
  ],
  summary: 'smoke',
  frames: [],
  keyframes: { p1: '', p4: '', p7: '', p10: '' },
};

const plan = buildSwingPlan({
  metrics: analysis.metrics,
  angle: 'dtl',
  profile: { ...DEFAULT_PROFILE, biggestLeak: 'approach', goals: ['approaches'] },
});
assert.ok(plan);
assert.equal(plan!.primary.faultId, 'early-extension');
console.log(
  `PASS: plan at 30fps — ${plan!.primary.faultId} · ${plan!.cycleWeeks}w · ${plan!.sessions.length} sessions`,
);

const guide = await buildSwingGuide({
  analysis,
  profile: DEFAULT_PROFILE,
  disableLlm: true,
});
assert.ok(guide);
assert.equal(guide!.usedLlm, false);
assert.ok(guide!.plan.checkpoints[0]?.instruction.includes('down-the-line'));
console.log('PASS: guide fallback renders for 30fps analysis');

console.log('\nAll swing smoke checks passed.');
