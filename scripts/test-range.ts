/** Driving range session and dispersion tests. */

import { computeLaunchMetrics, GOLF_BALL_DIAMETER_MM } from '../src/lib/launch';
import type { ScaleCalibration, TrackPoint } from '../src/lib/launch';
import {
  computeDispersionBand,
  computeSessionStats,
  landingFromAnalysis,
  landingsForSession,
  landingsFromHistory,
} from '../src/lib/range/dispersion';

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

const mmPerPixel = GOLF_BALL_DIAMETER_MM / 20;
const scale: ScaleCalibration = {
  mmPerPixel,
  ballPixelDiameter: 20,
  confidence: 'uncalibrated',
  assumptions: [],
};

function simulateCornerTrack(
  fps: number,
  frames: number,
  dxPerFrame: number,
  dyPerFrame: number,
): TrackPoint[] {
  const dt = 1 / fps;
  const track: TrackPoint[] = [];
  for (let i = 0; i < frames; i++) {
    track.push({
      t: i * dt,
      frameIndex: i,
      x: (500 + dxPerFrame * i) / 1000,
      y: (600 + dyPerFrame * i) / 1000,
      px: 500 + dxPerFrame * i,
      py: 600 + dyPerFrame * i,
    });
  }
  return track;
}

function makeAnalysis(dx: number, dy: number) {
  const track = simulateCornerTrack(120, 8, dx, dy);
  const out = computeLaunchMetrics({
    track,
    fps: 120,
    angle: 'corner',
    scale,
    club: 'driver',
  });
  if (out.metrics.length === 0) throw new Error('no metrics');
  return {
    ok: true as const,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    angle: 'corner' as const,
    fps: 120,
    tier: 'launch-monitor' as const,
    impactFrameIndex: 0,
    impactTime: 0,
    track,
    scale,
    metrics: out.metrics,
    unavailable: out.unavailable,
    setupWarnings: [],
  };
}

console.log('Driving range tests\n');

// --- landingFromAnalysis ---
{
  const straight = makeAnalysis(100, -20);
  const landing = landingFromAnalysis(straight);
  assert('straight landing has carry', landing != null && landing.carryYd > 20);
  assert(
    'straight landing near target line',
    landing != null && Math.abs(landing.lateralYd) < 5,
    `lateral=${landing?.lateralYd}`,
  );
}

{
  const push = makeAnalysis(800, -20);
  const landing = landingFromAnalysis(push);
  assert('push landing right', landing != null && landing.lateralYd > 0);
}

{
  const pull = makeAnalysis(40, -20);
  const landing = landingFromAnalysis(pull);
  assert('pull landing left', landing != null && landing.lateralYd < 0);
}

// --- computeSessionStats ---
{
  const shots = [makeAnalysis(100, -20), makeAnalysis(110, -20), makeAnalysis(90, -20)];
  const landings = shots.map((s) => landingFromAnalysis(s)!).filter(Boolean);
  const stats = computeSessionStats(landings);
  assert('session shot count', stats.shotCount === 3);
  assert('session avg carry', stats.avgCarryYd != null && stats.avgCarryYd > 0);
  assert('session carry spread', stats.carrySpreadYd != null && stats.carrySpreadYd >= 0);
}

// --- landingsForSession preserves order ---
{
  const a = makeAnalysis(100, -20);
  const b = makeAnalysis(800, -20);
  a.id = 'shot-a';
  b.id = 'shot-b';
  b.createdAt = a.createdAt + 1000;
  const landings = landingsForSession(['shot-a', 'shot-b'], [a, b]);
  assert('landings order', landings.length === 2 && landings[0]!.launchId === 'shot-a');
  assert(
    'landings push vs straight',
    landings[1]!.lateralYd > landings[0]!.lateralYd,
  );
}

// --- landingsFromHistory ---
{
  const a = makeAnalysis(100, -20);
  const b = makeAnalysis(800, -20);
  a.id = 'hist-a';
  b.id = 'hist-b';
  b.createdAt = a.createdAt + 5000;
  const landings = landingsFromHistory([a, b]);
  assert('history newest first', landings[0]!.launchId === 'hist-b');
  assert('history count', landings.length === 2);
}

// --- computeDispersionBand ---
{
  const shots = [
    makeAnalysis(100, -20),
    makeAnalysis(105, -20),
    makeAnalysis(95, -20),
    makeAnalysis(102, -20),
  ];
  const landings = shots.map((s) => landingFromAnalysis(s)!);
  const band = computeDispersionBand(landings);
  assert('band with 4 shots', band != null && band.semiAxisCarryYd > 0);
  assert('band too few shots', computeDispersionBand(landings.slice(0, 2)) == null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
