/** Verify launch physics with hand-computed cases. */

import {
  analyzeCornerFlight,
  estimateCarryYards,
  estimateTotalYards,
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

const total = estimateTotalYards(200, 'driver');
assert('total > carry', total > 200 && total <= 230, `got ${total} yd`);

// Corner decomposition sanity: upward + forward screen motion
const cornerTrack = [
  { t: 0, frameIndex: 0, x: 0.5, y: 0.6, px: 500, py: 600 },
  { t: 0.008, frameIndex: 1, x: 0.52, y: 0.58, px: 520, py: 580 },
  { t: 0.016, frameIndex: 2, x: 0.54, y: 0.55, px: 540, py: 550 },
  { t: 0.024, frameIndex: 3, x: 0.56, y: 0.52, px: 560, py: 520 },
];
const corner = analyzeCornerFlight(cornerTrack, mmPerPx);
assert(
  'corner flight',
  corner != null && corner.launchAngleDeg > 5 && corner.ballSpeedMph > 0,
  corner ? `angle ${corner.launchAngleDeg}, speed ${corner.ballSpeedMph}` : 'null',
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
