#!/usr/bin/env node
/**
 * Radar maps sanity check (run with: npx tsx scripts/verify-radar.mts)
 */
import {
  fetchRainViewerMaps,
  frameKind,
  nowFrameIndex,
  radarTileUrl,
} from '../src/lib/rainviewer.ts';

const maps = await fetchRainViewerMaps();
console.log({
  provider: maps.provider,
  host: maps.host,
  pastCount: maps.pastCount,
  nowcastCount: maps.nowcastCount,
  frames: maps.frames.length,
  nowIdx: nowFrameIndex(maps),
  kinds: {
    first: frameKind(maps, 0),
    now: frameKind(maps, nowFrameIndex(maps)),
    last: frameKind(maps, maps.frames.length - 1),
  },
});

if (maps.nowcastCount < 1) {
  console.error('FAIL: expected forecast/nowcast frames');
  process.exit(1);
}

const forecast = maps.frames[maps.frames.length - 1]!;
const tile = radarTileUrl(maps.host, forecast).replace(
  '{z}/{x}/{y}',
  '6/12/25',
);
const res = await fetch(tile);
console.log('forecast tile', res.status, res.headers.get('content-type'));
if (!res.ok) {
  console.error('FAIL: forecast tile fetch');
  process.exit(1);
}
console.log('OK radar forecast via', maps.attributionName);
