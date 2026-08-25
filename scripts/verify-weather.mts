#!/usr/bin/env node
/**
 * Phase-1 weather provider sanity checks (run with: npx tsx scripts/verify-weather.mts)
 */
import ensembleHandler from '../api/golf/ensemble.ts';

async function hit(label: string, url: string, env?: Record<string, string>) {
  const prev: Record<string, string | undefined> = {};
  if (env) {
    for (const [k, v] of Object.entries(env)) {
      prev[k] = process.env[k];
      process.env[k] = v;
    }
  }
  try {
    const res = await ensembleHandler(new Request(url));
    const body = await res.json();
    console.log('\n===', label, 'status', res.status, '===');
    console.log('keys', Object.keys(body).sort());
    console.log('ensemble keys', Object.keys(body.ensemble || {}).sort());
    console.log('turf keys', Object.keys(body.turf || {}).sort());
    console.log({
      attribution: body.attribution,
      agreement: body.ensemble?.agreement,
      confidence: body.ensemble?.confidence,
      modelsUsed: body.ensemble?.modelsUsed,
      modelsFailed: body.ensemble?.modelsFailed,
      windMph: body.ensemble?.windMph,
      turfConfidence: body.turf?.confidence,
      tip0: body.holes?.[0]?.tip?.slice(0, 80),
    });
    return body;
  } finally {
    if (env) {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }
}

const us = await hit(
  'US Scottsdale (default nws,metno)',
  'http://local/api/golf/ensemble?lat=33.49&lon=-111.92&hour=6',
);

const london = await hit(
  'London (metno)',
  'http://local/api/golf/ensemble?lat=51.50&lon=-0.12&hour=6',
);

const nwsOnly = await hit(
  'US NWS only',
  'http://local/api/golf/ensemble?lat=33.49&lon=-111.92&hour=6',
  { WEATHER_PROVIDERS: 'nws' },
);

console.log('\n--- key diff vs production baseline ---');
const before = {
  top: [
    'attribution',
    'ensemble',
    'holes',
    'hour',
    'lat',
    'lon',
    'summary',
    'time',
    'turf',
  ],
  ensemble: [
    'agreement',
    'gustMph',
    'modelsFailed',
    'modelsUsed',
    'windFromDeg',
    'windMph',
  ],
  turf: [
    'et0Mm48h',
    'fairway',
    'fairwayRollYd',
    'green',
    'greenReleaseYd',
    'humidityPct',
    'note',
    'precipIn48h',
    'soilMoisture',
  ],
};
const afterTop = Object.keys(us).sort();
const afterEns = Object.keys(us.ensemble || {}).sort();
const afterTurf = Object.keys(us.turf || {}).sort();
console.log('added top', afterTop.filter((k) => !before.top.includes(k)));
console.log(
  'removed top',
  before.top.filter((k) => !afterTop.includes(k)),
);
console.log(
  'added ensemble',
  afterEns.filter((k) => !before.ensemble.includes(k)),
);
console.log(
  'removed ensemble',
  before.ensemble.filter((k) => !afterEns.includes(k)),
);
console.log('added turf', afterTurf.filter((k) => !before.turf.includes(k)));
console.log(
  'removed turf',
  before.turf.filter((k) => !afterTurf.includes(k)),
);
console.log('london sources', london.ensemble?.modelsUsed);
console.log('nws-only agreement', nwsOnly.ensemble?.agreement, nwsOnly.ensemble?.confidence);
console.log('nws-only tip prefix', nwsOnly.summary?.slice(0, 120));
