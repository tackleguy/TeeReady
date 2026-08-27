/**
 * Live local Llama smoke for the round caddie.
 * Requires LM Studio / Ollama at VITE_SWING_LLM_URL (default http://localhost:1234/v1).
 * Any LLM miss, rejection, or rules fallback exits non-zero — no silent pass.
 *
 * Run: npm run smoke:caddy-llm
 */

import {
  askCaddy,
  autoCaddyTip,
  buildCaddyContext,
  probeCaddyLlm,
  resolveCaddyLlmModel,
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

function fail(msg: string): never {
  console.error('FAIL:', msg);
  process.exit(1);
}

const reachable = await probeCaddyLlm();
if (!reachable) {
  fail(
    'Local LLM not reachable at http://localhost:1234/v1 — start LM Studio server and load a chat model.',
  );
}

const model = await resolveCaddyLlmModel();
console.log('Using local model:', model);

const tip = await autoCaddyTip(ctx, { requireLlm: true });
if (tip.source !== 'llm') {
  fail(`auto tip source=${tip.source} notice=${tip.notice ?? tip.rejectionReason}`);
}
if (!tip.text.trim()) fail('auto tip empty');
console.log('PASS: auto tip (llm)', tip.text.slice(0, 160));

const ask = await askCaddy(ctx, 'What club for the approach?', {
  requireLlm: true,
});
if (ask.source !== 'llm') {
  fail(`ask source=${ask.source} notice=${ask.notice ?? ask.rejectionReason}`);
}
if (!ask.text.trim()) fail('ask empty');
console.log('PASS: ask (llm)', ask.text.slice(0, 160));

console.log('\nLocal Llama caddy smoke passed.');
