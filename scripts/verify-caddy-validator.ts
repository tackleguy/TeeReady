/**
 * Verify round caddie rejects fabricated numbers.
 * Run: npx tsx scripts/verify-caddy-validator.ts
 */

import {
  buildCaddyContext,
  rulesCaddyTip,
  validateCaddyResponse,
} from '../src/lib/caddy';
import type { GolfHole } from '../src/lib/golf';
import { bagFromStocks, DEFAULT_PROFILE } from '../src/lib/golfProfile';

const hole: GolfHole = {
  number: 7,
  par: 4,
  yards: 385,
  bearingDeg: 210,
  tee: { lat: 37.4, lon: -122.1 },
  green: { lat: 37.401, lon: -122.102 },
  source: 'tee-green',
};

const ctx = buildCaddyContext({
  mode: 'prep',
  courseName: 'Test Links',
  hole,
  profile: DEFAULT_PROFILE,
  bag: bagFromStocks(DEFAULT_PROFILE.driverYards, DEFAULT_PROFILE.sevenIronYards),
  brief: {
    number: 7,
    yards: 385,
    bearingDeg: 210,
    windFromDeg: 180,
    windMph: 12,
    gustMph: 18,
    headwindMph: 8,
    crosswindMph: -3,
    driftYards: -4,
    slopeYards: 2,
    elevationChangeFt: 6,
    windAdjustmentYards: 6,
    playsLikeYards: 391,
    aspect: 'quarter-head',
    tip: 'Hold a touch more club into the breeze.',
    clubHint: '7i approach after a controlled tee shot',
    recommendedClub: 'Driver → 7i',
    modelAgreement: 0.8,
  },
  turf: {
    fairway: 'firm',
    green: 'medium',
    precipIn48h: 0.05,
    et0Mm48h: 5,
    humidityPct: 50,
    soilMoisture: null,
    fairwayRollYd: 8,
    greenReleaseYd: 6,
    note: 'test',
  },
  forecast: null,
});

const fabricated =
  'Take one more club — this plays closer to 420 with the wind. Aim 15 yards left.';
const good =
  'Into this quarter-head breeze the hole plays like 391. Favor your Driver → 7i shape and plan for your miss.';

let failed = false;

const bad = validateCaddyResponse(fabricated, ctx.facts);
if (bad.ok) {
  console.error('FAIL: fabricated 420/15 accepted');
  failed = true;
} else if (bad.reason !== 'fabricated-number') {
  console.error('FAIL: expected fabricated-number, got', bad.reason);
  failed = true;
} else {
  console.log('PASS: fabricated yardages rejected —', bad.detail);
}

const ok = validateCaddyResponse(good, ctx.facts);
if (!ok.ok) {
  console.error('FAIL: valid tip rejected —', ok.detail);
  failed = true;
} else {
  console.log('PASS: tip using only fact numbers accepted');
}

const rules = rulesCaddyTip(ctx);
if (!rules.text.includes('391') && !/club|7i|Driver/i.test(rules.text)) {
  console.error('FAIL: rules tip missing plays-like or club', rules.text);
  failed = true;
} else {
  console.log('PASS: rules fallback tip:', rules.text.slice(0, 120));
}

const gpsCtx = buildCaddyContext({
  ...{
    mode: 'gps' as const,
    courseName: 'Test Links',
    hole,
    profile: DEFAULT_PROFILE,
    bag: bagFromStocks(
      DEFAULT_PROFILE.driverYards,
      DEFAULT_PROFILE.sevenIronYards,
    ),
    brief: ctx.brief,
    turf: ctx.turf,
    forecast: null,
    remain: { front: 148, mid: 156, back: 164 },
  },
});
const gpsTip = rulesCaddyTip(gpsCtx);
if (!gpsTip.text.includes('156')) {
  console.error('FAIL: GPS rules tip missing remain mid', gpsTip.text);
  failed = true;
} else {
  console.log('PASS: GPS rules tip:', gpsTip.text.slice(0, 120));
}

if (failed) process.exit(1);
console.log('All caddy checks passed.');
