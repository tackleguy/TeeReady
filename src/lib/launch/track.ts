/** Motion-based ball blob detection and tracking. */

import type { TrackPoint } from './types';
import type { SampledFrame } from './frames';

type Blob = {
  cx: number;
  cy: number;
  area: number;
  brightness: number;
};

const BLOCK = 4;

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Difference map between two frames; returns motion score per block. */
function motionBlocks(
  prev: SampledFrame,
  curr: SampledFrame,
): Float32Array {
  const { width: w, height: h } = curr;
  const cols = Math.ceil(w / BLOCK);
  const rows = Math.ceil(h / BLOCK);
  const diff = new Float32Array(cols * rows);

  for (let by = 0; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      let sum = 0;
      let count = 0;
      const x0 = bx * BLOCK;
      const y0 = by * BLOCK;
      for (let dy = 0; dy < BLOCK; dy++) {
        for (let dx = 0; dx < BLOCK; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x >= w || y >= h) continue;
          const i = (y * w + x) * 4;
          const dr = Math.abs(curr.data[i]! - prev.data[i]!);
          const dg = Math.abs(curr.data[i + 1]! - prev.data[i + 1]!);
          const db = Math.abs(curr.data[i + 2]! - prev.data[i + 2]!);
          sum += (dr + dg + db) / 3;
          count++;
        }
      }
      diff[by * cols + bx] = count > 0 ? sum / count : 0;
    }
  }
  return diff;
}

/** Find brightest moving blob in lower 70% of frame (typical ball flight zone). */
function findMovingBlob(
  frame: SampledFrame,
  motion: Float32Array,
  motionThreshold: number,
  searchYMin: number,
): Blob | null {
  const { width: w, height: h, data } = frame;
  const cols = Math.ceil(w / BLOCK);
  const rows = Math.ceil(h / BLOCK);
  const yStart = Math.floor((searchYMin * h) / BLOCK);

  let best: Blob | null = null;
  let bestScore = 0;

  for (let by = yStart; by < rows; by++) {
    for (let bx = 0; bx < cols; bx++) {
      const m = motion[by * cols + bx]!;
      if (m < motionThreshold) continue;

      let brightSum = 0;
      let count = 0;
      const x0 = bx * BLOCK;
      const y0 = by * BLOCK;
      for (let dy = 0; dy < BLOCK; dy++) {
        for (let dx = 0; dx < BLOCK; dx++) {
          const x = x0 + dx;
          const y = y0 + dy;
          if (x >= w || y >= h) continue;
          const i = (y * w + x) * 4;
          const lum = luminance(data[i]!, data[i + 1]!, data[i + 2]!);
          brightSum += lum;
          count++;
        }
      }
      const avgBright = count > 0 ? brightSum / count : 0;
      if (avgBright < 160) continue;

      const score = m * avgBright;
      if (score > bestScore) {
        bestScore = score;
        best = {
          cx: x0 + BLOCK / 2,
          cy: y0 + BLOCK / 2,
          area: BLOCK * BLOCK,
          brightness: avgBright,
        };
      }
    }
  }
  return best;
}

/** Static bright blob (ball at address) in lower-center region. */
export function findStaticBallBlob(frame: SampledFrame): Blob | null {
  const { width: w, height: h, data } = frame;
  const xMin = w * 0.25;
  const xMax = w * 0.75;
  const yMin = h * 0.45;
  const yMax = h * 0.92;

  let best: Blob | null = null;
  let bestScore = 0;

  for (let y = yMin; y < yMax; y += 2) {
    for (let x = xMin; x < xMax; x += 2) {
      const i = (Math.floor(y) * w + Math.floor(x)) * 4;
      const lum = luminance(data[i]!, data[i + 1]!, data[i + 2]!);
      if (lum < 170) continue;

      let radius = 0;
      for (let r = 2; r <= 24; r += 2) {
        const sx = Math.floor(x - r);
        const sy = Math.floor(y - r);
        if (sx < 0 || sy < 0 || sx + r * 2 >= w || sy + r * 2 >= h) break;
        let ringBright = 0;
        let ringCount = 0;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          const px = Math.floor(x + Math.cos(ang) * r);
          const py = Math.floor(y + Math.sin(ang) * r);
          const pi = (py * w + px) * 4;
          ringBright += luminance(data[pi]!, data[pi + 1]!, data[pi + 2]!);
          ringCount++;
        }
        if (ringCount > 0 && ringBright / ringCount > 150) radius = r;
      }

      if (radius >= 3) {
        const score = lum * radius;
        if (score > bestScore) {
          bestScore = score;
          best = {
            cx: x,
            cy: y,
            area: Math.PI * radius * radius,
            brightness: lum,
          };
        }
      }
    }
  }
  return best;
}

export function estimateBallPixelDiameter(blob: Blob): number {
  const d = 2 * Math.sqrt(blob.area / Math.PI);
  return Math.max(4, Math.min(d * 1.4, 80));
}

function dist(a: { cx: number; cy: number }, b: { cx: number; cy: number }): number {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy);
}

/**
 * Track ball from frame series using motion + brightness.
 * Returns points and estimated impact index (first high-velocity frame).
 */
export function trackBall(
  frames: SampledFrame[],
  _fps: number,
): { track: TrackPoint[]; impactIndex: number } {
  if (frames.length < 2) return { track: [], impactIndex: 0 };

  const velocities: number[] = [0];
  const centroids: Array<{ cx: number; cy: number } | null> = [null];

  for (let i = 1; i < frames.length; i++) {
    const motion = motionBlocks(frames[i - 1]!, frames[i]!);
    const motionValues = Array.from(motion).filter((v) => v > 0);
    motionValues.sort((a, b) => a - b);
    const p75 = motionValues[Math.floor(motionValues.length * 0.75)] ?? 8;
    const threshold = Math.max(6, p75 * 0.6);

    const blob = findMovingBlob(frames[i]!, motion, threshold, 0.15);
    centroids.push(blob ? { cx: blob.cx, cy: blob.cy } : null);

    if (blob && centroids[i - 1]) {
      velocities.push(dist(blob, centroids[i - 1]!));
    } else {
      velocities.push(0);
    }
  }

  // Impact: first frame where velocity exceeds 3× rolling median of prior motion.
  let impactIndex = Math.floor(frames.length * 0.3);
  const preVel = velocities.slice(1, Math.max(2, Math.floor(frames.length * 0.5)));
  preVel.sort((a, b) => a - b);
  const baseline = preVel[Math.floor(preVel.length * 0.5)] ?? 2;
  const impactThreshold = Math.max(baseline * 3, 8);

  for (let i = 1; i < velocities.length; i++) {
    if (velocities[i]! >= impactThreshold) {
      impactIndex = i;
      break;
    }
  }

  const track: TrackPoint[] = [];
  let last: { cx: number; cy: number } | null = centroids[impactIndex] ?? null;

  for (let i = impactIndex; i < frames.length; i++) {
    const frame = frames[i]!;
    let pt = centroids[i];

    if (!pt && last && i > impactIndex) {
      const motion = motionBlocks(frames[i - 1]!, frame);
      pt = findMovingBlob(frame, motion, 4, 0);
    }

    if (pt) {
      last = pt;
      track.push({
        t: frame.t,
        frameIndex: frame.index,
        x: pt.cx / frame.width,
        y: pt.cy / frame.height,
        px: pt.cx,
        py: pt.cy,
      });
    } else if (last && track.length > 0) {
      break;
    }
  }

  return { track: smoothTrack(track), impactIndex };
}

/** Light smoothing on early flight points for stabler fits. */
function smoothTrack(track: TrackPoint[]): TrackPoint[] {
  if (track.length < 3) return track;
  return track.map((p, i) => {
    if (i === 0 || i === track.length - 1) return p;
    const prev = track[i - 1]!;
    const next = track[i + 1]!;
    return {
      ...p,
      px: prev.px * 0.2 + p.px * 0.6 + next.px * 0.2,
      py: prev.py * 0.2 + p.py * 0.6 + next.py * 0.2,
      x: prev.x * 0.2 + p.x * 0.6 + next.x * 0.2,
      y: prev.y * 0.2 + p.y * 0.6 + next.y * 0.2,
    };
  });
}

export function speedPxPerFrame(track: TrackPoint[]): number[] {
  const speeds: number[] = [];
  for (let i = 1; i < track.length; i++) {
    const dx = track[i]!.px - track[i - 1]!.px;
    const dy = track[i]!.py - track[i - 1]!.py;
    speeds.push(Math.hypot(dx, dy));
  }
  return speeds;
}

export { type Blob };
