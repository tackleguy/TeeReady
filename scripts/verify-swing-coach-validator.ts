/**
 * Phase 2 verify: fabricated-number rejection.
 * Run: npx tsx scripts/verify-swing-coach-validator.ts
 */

import { validateCoachResponse } from '../src/lib/swing/coach/validate';
import type { SwingMetric } from '../src/lib/swing/types';

const metrics: SwingMetric[] = [
  {
    id: 'shoulder_turn_p4',
    label: 'Shoulder turn at P4',
    value: 82.5,
    unit: '°',
    confidence: 'high',
    validAtFps: 30,
    angle: 'dtl',
  },
  {
    id: 'x_factor',
    label: 'X-factor at P4',
    value: 41,
    unit: '°',
    confidence: 'high',
    validAtFps: 30,
    angle: 'dtl',
  },
];

const fabricated =
  "What's working: your posture looks athletic at address.\n\n" +
  'Highest-leverage fault: a short shoulder turn — about 48° when you want closer to a full coil.\n\n' +
  'Drill: make three slow rehearsals feeling the trail shoulder turn behind you.';

const good =
  "What's working: posture at address looks athletic and quiet.\n\n" +
  'Highest-leverage fault: shoulder turn at the top is a bit short — the measured 82.5° coil can still grow without swaying.\n\n' +
  'Drill: three slow rehearsals feeling the trail shoulder turn behind you, then hit five balls with that one feel.';

const bad = validateCoachResponse(fabricated, metrics, [60]);
const ok = validateCoachResponse(good, metrics, [60]);

let failed = false;

if (bad.ok) {
  console.error('FAIL: fabricated 48° shoulder turn was accepted');
  failed = true;
} else if (bad.reason !== 'fabricated-number') {
  console.error('FAIL: expected fabricated-number, got', bad.reason, bad.detail);
  failed = true;
} else {
  console.log('PASS: fabricated 48° response rejected —', bad.detail);
}

if (!ok.ok) {
  console.error('FAIL: valid response rejected —', ok.detail);
  failed = true;
} else {
  console.log('PASS: response using only JSON numbers accepted');
}

if (failed) process.exit(1);
