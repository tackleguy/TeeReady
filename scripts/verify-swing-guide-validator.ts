/**
 * Phase 2B verify: guide section validators (fabricated number + unknown drill).
 * Run: npx tsx scripts/verify-swing-guide-validator.ts
 */

import assert from 'node:assert/strict';
import {
  validateGuideSection,
  validateMentionedDrills,
} from '../src/lib/swing/guide/validate';

const input = {
  primary: { label: 'Early extension', metricValue: 11, metricUnit: '°' },
  metrics: [{ id: 'early_extension', value: 11, unit: '°' }],
};

{
  const bad = validateGuideSection({
    section: 'assessment',
    text: 'Your early extension is about 19 degrees and getting worse.',
    inputJson: input,
  });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.equal(bad.reason, 'fabricated-number');
  console.log('PASS: invented number discarded —', !bad.ok && bad.detail);
}

{
  const good = validateGuideSection({
    section: 'assessment',
    text: 'Measured early extension sits at 11° on this down-the-line clip — posture is standing up into the strike.',
    inputJson: input,
    extraNumbers: [],
  });
  // "11" appears in JSON as 11 — should pass
  assert.equal(good.ok, true, !good.ok ? good.detail : '');
  console.log('PASS: JSON number allowed in assessment');
}

{
  const drillBad = validateMentionedDrills(['Invisible Laser Beam Drill']);
  assert.ok(drillBad && !drillBad.ok);
  if (drillBad && !drillBad.ok) assert.equal(drillBad.reason, 'unknown-drill');
  console.log('PASS: unknown drill name discarded —', drillBad && !drillBad.ok && drillBad.detail);
}

{
  const drillOk = validateMentionedDrills(['Wall butt-brush', 'Pause at the top']);
  assert.equal(drillOk, null);
  console.log('PASS: library drill names accepted');
}

console.log('\nGuide validator checks passed.');
