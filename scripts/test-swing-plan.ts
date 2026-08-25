/**
 * Unit tests for deterministic swingPlan (no LLM).
 * Run: npx tsx scripts/test-swing-plan.ts
 */

import assert from 'node:assert/strict';
import { DEFAULT_PROFILE } from '../src/lib/golfProfile';
import {
  buildSwingPlan,
  cycleWeeksFor,
  detectFaults,
  findRootFaultId,
  rankFaults,
  selectFocus,
} from '../src/lib/swingPlan';
import type { SwingMetric } from '../src/lib/swing/types';

function m(
  partial: Pick<SwingMetric, 'id' | 'value' | 'unit' | 'angle'> &
    Partial<SwingMetric>,
): SwingMetric {
  return {
    label: partial.id,
    confidence: partial.confidence ?? 'high',
    validAtFps: partial.validAtFps ?? 30,
    ...partial,
  };
}

// --- Early extension DTL → root, 4-week moderate cycle ---
{
  const metrics: SwingMetric[] = [
    m({ id: 'early_extension', value: 14, unit: '°', angle: 'dtl' }),
    m({ id: 'spine_address', value: 34, unit: '°', angle: 'dtl' }),
    m({ id: 'shoulder_turn_p4', value: 88, unit: '°', angle: 'dtl' }),
    m({ id: 'hip_turn_p4', value: 42, unit: '°', angle: 'dtl' }),
    m({ id: 'x_factor', value: 46, unit: '°', angle: 'dtl' }),
    m({ id: 'head_depth', value: 0.04, unit: 'shoulder widths', angle: 'dtl' }),
  ];
  const detected = detectFaults(metrics, 'dtl');
  assert.ok(
    detected.some((d) => d.faultId === 'early-extension'),
    'early-extension should detect',
  );
  const ranked = rankFaults(detected, DEFAULT_PROFILE);
  const focus = selectFocus(ranked);
  assert.ok(focus);
  assert.equal(cycleWeeksFor(focus!.primary.severity), 4);

  const plan = buildSwingPlan({
    metrics,
    angle: 'dtl',
    profile: {
      ...DEFAULT_PROFILE,
      biggestLeak: 'approach',
      goals: ['approaches'],
      practiceFocus: 'range',
      roundsPerMonthGoal: 4,
    },
  });
  assert.ok(plan);
  assert.equal(plan!.rootFaultId, 'early-extension');
  assert.equal(plan!.cycleWeeks, 4);
  assert.ok(plan!.sessions.length > 0);
  assert.ok(plan!.checkpoints.length > 0);
  assert.ok(plan!.checkpoints[0]!.instruction.includes('down-the-line'));
  console.log('PASS: early-extension moderate → 4-week cycle, root early-extension');
}

// --- Low-confidence metric must NOT trigger ---
{
  const metrics: SwingMetric[] = [
    m({
      id: 'early_extension',
      value: 20,
      unit: '°',
      angle: 'dtl',
      confidence: 'low',
      validAtFps: 60,
    }),
  ];
  const detected = detectFaults(metrics, 'dtl');
  assert.equal(detected.length, 0, 'low confidence must not detect');
  console.log('PASS: low-confidence metric ignored');
}

// --- Sway face-on; root preference ---
{
  const metrics: SwingMetric[] = [
    m({ id: 'hip_sway', value: 0.34, unit: 'shoulder widths', angle: 'face-on' }),
    m({ id: 'hip_slide', value: 0.1, unit: 'shoulder widths', angle: 'face-on' }),
    m({ id: 'head_lateral', value: 0.2, unit: 'shoulder widths', angle: 'face-on' }),
    m({ id: 'weight_shift', value: 0.05, unit: 'shoulder widths', angle: 'face-on' }),
    m({ id: 'lead_arm_p4', value: 130, unit: '°', angle: 'face-on' }),
    m({ id: 'tempo_ratio', value: 2.8, unit: ':1', angle: 'face-on' }),
  ];
  const detected = detectFaults(metrics, 'face-on');
  assert.ok(detected.some((d) => d.faultId === 'sway'));
  assert.ok(detected.some((d) => d.faultId === 'head-sway'));
  const root = findRootFaultId(detected);
  assert.equal(root, 'sway', 'sway should root over head-sway symptom');
  const plan = buildSwingPlan({
    metrics,
    angle: 'face-on',
    profile: {
      ...DEFAULT_PROFILE,
      biggestLeak: 'driving',
      goals: ['fairways'],
      practiceFocus: 'course',
      roundsPerMonthGoal: 2,
    },
  });
  assert.ok(plan);
  assert.equal(plan!.primary.faultId, 'sway');
  assert.equal(plan!.cycleWeeks, 6); // severe sway at 0.34
  assert.ok(
    plan!.sessions.some((s) => s.drills.some((d) => d.location === 'course' || d.drillId === 'pre-round-three-feel')),
    'course focus should include course-friendly drills',
  );
  console.log('PASS: sway roots over head-sway; severe → 6 weeks');
}

// --- Insufficient shoulder turn → mild band near threshold ---
{
  const metrics: SwingMetric[] = [
    m({ id: 'shoulder_turn_p4', value: 65, unit: '°', angle: 'dtl' }),
    m({ id: 'early_extension', value: 3, unit: '°', angle: 'dtl' }),
    m({ id: 'spine_address', value: 35, unit: '°', angle: 'dtl' }),
    m({ id: 'hip_turn_p4', value: 40, unit: '°', angle: 'dtl' }),
    m({ id: 'x_factor', value: 25, unit: '°', angle: 'dtl' }),
    m({ id: 'head_depth', value: 0.02, unit: 'shoulder widths', angle: 'dtl' }),
  ];
  const plan = buildSwingPlan({
    metrics,
    angle: 'dtl',
    profile: DEFAULT_PROFILE,
  });
  assert.ok(plan);
  assert.ok(
    plan!.matched.some((m) => m.faultId === 'insufficient-shoulder-turn'),
  );
  assert.ok([2, 4, 6].includes(plan!.cycleWeeks));
  console.log('PASS: insufficient shoulder turn detected');
}

console.log('\nAll swingPlan tests passed.');
