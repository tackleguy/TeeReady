/**
 * Tiny node harness for GPS accuracy + error-path helpers (Agent B verify).
 * Run: npx tsx src/lib/gpsReliability.harness.ts
 */
import {
  decideGpsFix,
  GPS_ACCEPT_ACCURACY_M,
  GPS_ERR_PERMISSION,
  GPS_ERR_TIMEOUT,
  GPS_ERR_UNAVAILABLE,
  handleGpsErrorCode,
} from './gpsReliability';

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

// --- Accuracy filtering ---
assert(GPS_ACCEPT_ACCURACY_M === 25, 'threshold is 25 m');

const good = decideGpsFix(8, false);
assert(good.action === 'accept' && !good.approximate, '8 m fix accepted');

const hold = decideGpsFix(80, true);
assert(
  hold.action === 'hold' && hold.approximate,
  '80 m with last good → hold + approximate',
);

const soft = decideGpsFix(100, false);
assert(
  soft.action === 'accept_soft' && soft.approximate,
  '100 m with no last good → soft accept + approximate',
);

const edge = decideGpsFix(25, true);
assert(edge.action === 'accept' && !edge.approximate, '25 m exactly accepted');

const justOver = decideGpsFix(25.1, true);
assert(
  justOver.action === 'hold' && justOver.approximate,
  '25.1 m held when last good exists',
);

// Simulate yardage hold: last good 150 yd-equivalent coords stay put.
const lastGood = { lat: 37.0, lon: -122.0, accuracyM: 6 };
const poor = { lat: 37.001, lon: -122.001, accuracyM: 90 };
const d = decideGpsFix(poor.accuracyM, true);
const displayed =
  d.action === 'hold' ? lastGood : d.action === 'accept' ? poor : poor;
assert(
  displayed.lat === lastGood.lat && displayed.lon === lastGood.lon,
  'poor fix keeps last-good position (yardage holds)',
);

// --- Error paths ---
const perm = handleGpsErrorCode(GPS_ERR_PERMISSION, false);
assert(perm.retry === false && perm.status === 'gps_off', 'PERMISSION_DENIED → gps_off, no retry');
assert(
  /Enable location|Settings/i.test(perm.message),
  `PERMISSION_DENIED message actionable: ${perm.message.slice(0, 60)}…`,
);

const unavail = handleGpsErrorCode(GPS_ERR_UNAVAILABLE, true);
assert(
  unavail.retry === true && unavail.status === 'signal_lost',
  'POSITION_UNAVAILABLE + last known → signal_lost + retry',
);
assert(/last known|Retrying/i.test(unavail.message), unavail.message);

const timeout = handleGpsErrorCode(GPS_ERR_TIMEOUT, false);
assert(
  timeout.retry === true && timeout.status === 'searching',
  'TIMEOUT without fix → searching + retry',
);
assert(/timed out|Retrying/i.test(timeout.message), timeout.message);

console.log('\n--- User-visible messages ---');
console.log('PERMISSION_DENIED:', perm.message);
console.log('POSITION_UNAVAILABLE (has last):', unavail.message);
console.log(
  'TIMEOUT (no last):',
  handleGpsErrorCode(GPS_ERR_TIMEOUT, false).message,
);
console.log(
  'UNAVAILABLE (no last):',
  handleGpsErrorCode(GPS_ERR_UNAVAILABLE, false).message,
);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll gpsReliability harness checks passed.');
