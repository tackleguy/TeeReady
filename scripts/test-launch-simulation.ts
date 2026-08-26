/** Simulated launch-monitor scenarios — end-to-end metric checks. */

import {
  computeLaunchMetrics,
  GOLF_BALL_DIAMETER_MM,
  LM_NUMBERS_MIN_FPS,
} from '../src/lib/launch';
import type { ScaleCalibration, TrackPoint } from '../src/lib/launch';

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

function metric(
  metrics: { id: string; value: number }[],
  id: string,
): number | undefined {
  return metrics.find((m) => m.id === id)?.value;
}

const mmPerPixel = GOLF_BALL_DIAMETER_MM / 20;
const scale: ScaleCalibration = {
  mmPerPixel,
  ballPixelDiameter: 20,
  confidence: 'uncalibrated',
  assumptions: ['simulated scale'],
};

/** Build corner-view track: dy negative = ball rises on screen. */
function simulateCornerTrack(
  fps: number,
  frames: number,
  dxPerFrame: number,
  dyPerFrame: number,
): TrackPoint[] {
  const dt = 1 / fps;
  const track: TrackPoint[] = [];
  for (let i = 0; i < frames; i++) {
    const px = 500 + dxPerFrame * i;
    const py = 600 + dyPerFrame * i;
    track.push({
      t: i * dt,
      frameIndex: i,
      x: px / 1000,
      y: py / 1000,
      px,
      py,
    });
  }
  return track;
}

/**
 * Straight downrange at ~45° corner: screen motion ≈ 5:1 horizontal vs vertical
 * (matches corner azimuth + downrange pitch decomposition).
 */
function straightDriverTrack(fps: number): TrackPoint[] {
  return simulateCornerTrack(fps, 8, 100, -20);
}

/** Push — extra screen-right vs straight, same vertical component. */
function pushTrack(fps: number): TrackPoint[] {
  return simulateCornerTrack(fps, 8, 800, -20);
}

/** Pull — extra screen-left vs straight, same vertical component. */
function pullTrack(fps: number): TrackPoint[] {
  return simulateCornerTrack(fps, 8, 40, -20);
}

console.log('Launch monitor simulation tests\n');

// --- Corner: yardage + direction ---
{
  const track = straightDriverTrack(120);
  const out = computeLaunchMetrics({
    track,
    fps: 120,
    angle: 'corner',
    scale,
    club: 'driver',
  });
  const carry = metric(out.metrics, 'carry');
  const total = metric(out.metrics, 'total');
  const dir = metric(out.metrics, 'launch_direction');
  assert('corner straight has carry', carry != null && carry > 20, `carry=${carry}`);
  assert('corner straight total >= carry', total != null && carry != null && total >= carry, `total=${total}`);
  assert(
    'corner straight direction near 0',
    dir != null && Math.abs(dir) < 25,
    `dir=${dir}`,
  );
  assert('corner metrics count', out.metrics.length === 3, `got ${out.metrics.length}`);
}

{
  const out = computeLaunchMetrics({
    track: pushTrack(120),
    fps: 120,
    angle: 'corner',
    scale,
    club: '7-iron',
  });
  const dir = metric(out.metrics, 'launch_direction');
  assert('push trends right', dir != null && dir >= 2, `dir=${dir}`);
}

{
  const out = computeLaunchMetrics({
    track: pullTrack(120),
    fps: 120,
    angle: 'corner',
    scale,
    club: '7-iron',
  });
  const dir = metric(out.metrics, 'launch_direction');
  assert('pull trends left', dir != null && dir < 0, `dir=${dir}`);
}

// --- Low fps: yardage refused ---
{
  const out = computeLaunchMetrics({
    track: straightDriverTrack(24),
    fps: 24,
    angle: 'corner',
    scale,
  });
  assert('low fps no carry', metric(out.metrics, 'carry') == null);
  assert('low fps explains carry', Boolean(out.unavailable.carry?.includes(`${LM_NUMBERS_MIN_FPS}`)));
}

// --- No scale ---
{
  const out = computeLaunchMetrics({
    track: straightDriverTrack(120),
    fps: 120,
    angle: 'corner',
    scale: null,
  });
  assert('no scale no metrics', out.metrics.length === 0);
  assert('no scale unavailable carry', Boolean(out.unavailable.carry));
}

// --- Face-on: yardage only, no direction ---
{
  const track = simulateCornerTrack(120, 8, 0, -8);
  const out = computeLaunchMetrics({
    track,
    fps: 120,
    angle: 'face-on',
    scale,
    club: 'driver',
  });
  assert('face-on has carry', metric(out.metrics, 'carry') != null);
  assert('face-on no direction metric', metric(out.metrics, 'launch_direction') == null);
  assert('face-on direction unavailable note', Boolean(out.unavailable.launch_direction));
}

// --- DTL: needs corner ---
{
  const out = computeLaunchMetrics({
    track: simulateCornerTrack(120, 8, 15, -2),
    fps: 120,
    angle: 'dtl',
    scale,
  });
  assert('dtl no carry', metric(out.metrics, 'carry') == null);
  assert('dtl suggests corner', Boolean(out.unavailable.carry?.includes('corner')));
}

// --- Short track rejected ---
{
  const out = computeLaunchMetrics({
    track: simulateCornerTrack(120, 2, 5, -5),
    fps: 120,
    angle: 'corner',
    scale,
  });
  assert('short track no metrics', out.metrics.length === 0);
}

// --- 30 fps still produces yardage ---
{
  const out = computeLaunchMetrics({
    track: straightDriverTrack(30),
    fps: 30,
    angle: 'corner',
    scale,
    club: 'driver',
  });
  assert('30fps corner carry', metric(out.metrics, 'carry') != null);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
