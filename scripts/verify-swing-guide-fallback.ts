/**
 * Confirm full guide assembles with LLM disabled (authored fallbacks only).
 * Run: npx tsx scripts/verify-swing-guide-fallback.ts
 */

import assert from 'node:assert/strict';
import { DEFAULT_PROFILE } from '../src/lib/golfProfile';
import { buildSwingGuide } from '../src/lib/swing/guide/assemble';
import type { SwingAnalysis } from '../src/lib/swing/types';

const analysis: SwingAnalysis = {
  id: 'test-swing',
  createdAt: Date.now(),
  angle: 'dtl',
  handedness: 'right',
  fps: 60,
  positions: { p1: 0, p4: 10, p7: 20, p10: 30 },
  metrics: [
    {
      id: 'early_extension',
      label: 'Spine change P1→P7 (early extension)',
      value: 14,
      unit: '°',
      confidence: 'high',
      validAtFps: 60,
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
      label: 'Head depth change P1→P7',
      value: 0.03,
      unit: 'shoulder widths',
      confidence: 'high',
      validAtFps: 60,
      angle: 'dtl',
    },
  ],
  summary: 'Rule summary',
  frames: [],
  keyframes: { p1: '', p4: '', p7: '', p10: '' },
};

const guide = await buildSwingGuide({
  analysis,
  profile: {
    ...DEFAULT_PROFILE,
    biggestLeak: 'approach',
    goals: ['approaches'],
    practiceFocus: 'range',
    roundsPerMonthGoal: 3,
  },
  disableLlm: true,
});

assert.ok(guide, 'guide should build');
assert.equal(guide!.usedLlm, false);
assert.equal(guide!.prose.assessment.source, 'fallback');
assert.equal(guide!.prose.rootCause.source, 'fallback');
assert.equal(guide!.prose.whyDrills.source, 'fallback');
assert.ok(guide!.prose.weeklyFraming.every((w) => w.source === 'fallback'));
assert.equal(guide!.prose.visualRead.source, 'fallback');
assert.ok(guide!.plan.sessions.length > 0);
assert.ok(guide!.plan.checkpoints.length > 0);
assert.ok(guide!.plan.safetyLine.length > 0);
assert.ok(guide!.plan.scopeLine.length > 0);

console.log('PASS: full guide renders from authored fallbacks alone');
console.log(
  `  primary=${guide!.plan.primary.faultId} weeks=${guide!.plan.cycleWeeks} sessions=${guide!.plan.sessions.length}`,
);
