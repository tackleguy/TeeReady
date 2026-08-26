/** Verify launch physics with hand-computed cases. */

import {
  estimateCarryYards,
  GOLF_BALL_DIAMETER_MM,
  mphFromPixels,
} from '../src/lib/launch';

let passed = 0;
let failed = 0;

function assert(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? `: ${detail}` : ''}`);
  }
}

console.log('Launch physics verification\n');

// Ball 42.67mm = 20px diameter → mmPerPixel = 2.1335
const mmPerPx = GOLF_BALL_DIAMETER_MM / 20;
// Move 40px in 1/120s horizontally → speed
const dt = 1 / 120;
const mph = mphFromPixels(40, 0, dt, mmPerPx);
// 40 * 2.1335mm = 85.34mm = 0.08534m in 1/120s → 10.24 m/s → ~22.9 mph
assert('ball speed from pixels', mph > 22 && mph < 24, `got ${mph.toFixed(2)} mph`);

// Launch angle: rise 30px over 40px horizontal → atan(30/40) ≈ 36.87°
const launchDeg = (Math.atan2(30, 40) * 180) / Math.PI;
assert('launch angle geometry', launchDeg > 36 && launchDeg < 38, `got ${launchDeg}`);

// Carry with 150 mph, 12°, 2500 rpm should be positive and < 400 yd
const carry = estimateCarryYards(150, 12, 2500);
assert('carry positive', carry > 100 && carry < 400, `got ${carry} yd`);

// Zero launch → short roll
const flat = estimateCarryYards(100, 0, 2500);
assert('flat launch carry', flat >= 0 && flat < 50, `got ${flat} yd`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
