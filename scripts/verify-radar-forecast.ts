/** Quick checks for radar timeline helpers + advection shift. */
import assert from 'node:assert/strict';
import {
  lastPastFrameIndex,
  radarMapsCandidates,
  radarPhaseLabel,
  type RadarFrame,
} from '../src/lib/rainviewer.ts';
import { estimateAdvectionShift } from '../src/lib/radarNowcast.ts';

/** Minimal ImageData stand-in for Node (no canvas dependency). */
class NodeImageData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
const ImageDataCtor = (
  globalThis as { ImageData?: typeof NodeImageData }
).ImageData ?? NodeImageData;

function frame(time: number, kind: RadarFrame['kind']): RadarFrame {
  return { time, path: `/v2/radar/${time}`, kind };
}

{
  const frames = [
    frame(1000, 'past'),
    frame(1600, 'past'),
    frame(2200, 'nowcast'),
    frame(2800, 'nowcast'),
  ];
  assert.equal(lastPastFrameIndex(frames), 1);
  assert.equal(radarPhaseLabel(frames, 0), 'Past');
  assert.equal(radarPhaseLabel(frames, 1), 'Now');
  assert.equal(radarPhaseLabel(frames, 2), 'Forecast');
  assert.equal(radarPhaseLabel(frames, 3), 'Forecast');
}

{
  const candidates = radarMapsCandidates();
  assert.ok(candidates.includes('https://api.rainviewer.com/public/weather-maps.json'));
  assert.ok(candidates.includes('https://api.librewxr.net/public/weather-maps.json'));
}

{
  // Synthetic ImageData: bright blob moved +8,+6 between frames.
  const w = 128;
  const h = 128;
  const prev = new ImageDataCtor(w, h) as ImageData;
  const curr = new ImageDataCtor(w, h) as ImageData;
  const paint = (img: ImageData, ox: number, oy: number) => {
    for (let y = 40; y < 56; y += 1) {
      for (let x = 40; x < 56; x += 1) {
        const i = ((y + oy) * w + (x + ox)) * 4;
        img.data[i] = 40;
        img.data[i + 1] = 80;
        img.data[i + 2] = 200;
        img.data[i + 3] = 220;
      }
    }
  };
  paint(prev, 0, 0);
  paint(curr, 8, 6);
  const { dx, dy } = estimateAdvectionShift(prev, curr);
  assert.ok(Math.abs(dx - 8) <= 2, `expected dx≈8 got ${dx}`);
  assert.ok(Math.abs(dy - 6) <= 2, `expected dy≈6 got ${dy}`);
}

console.log('verify:radar-forecast ok');
