/** Short-range radar forecast by advecting the latest RainViewer composite. */

import { radarTileUrl, type RadarFrame } from './rainviewer';

const TILE_SIZE = 256;
const NOWCAST_FRAMES = 6;
const FRAME_STEP_SEC = 600;
const FETCH_ZOOM = 6;
/** Half-span in tiles around the course (~±3 tiles at z6 ≈ hundreds of km). */
const TILE_RADIUS = 2;

export type NowcastOptions = {
  host: string;
  pastFrames: RadarFrame[];
  lat: number;
  lon: number;
  signal?: AbortSignal;
  /** Number of 10-minute forecast steps (default 6 ≈ 60 min). */
  steps?: number;
};

function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function lat2tile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  );
}

function tile2lon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function tileImageUrl(
  host: string,
  frame: RadarFrame,
  z: number,
  x: number,
  y: number,
): string {
  return radarTileUrl(host, frame)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

async function loadImage(
  url: string,
  signal?: AbortSignal,
): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch(url, { signal, mode: 'cors', cache: 'force-cache' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const obj = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('tile decode failed'));
        el.src = obj;
      });
      return img;
    } finally {
      URL.revokeObjectURL(obj);
    }
  } catch {
    return null;
  }
}

async function stitchFrame(
  host: string,
  frame: RadarFrame,
  z: number,
  x0: number,
  y0: number,
  cols: number,
  rows: number,
  signal?: AbortSignal,
): Promise<ImageData | null> {
  const canvas = document.createElement('canvas');
  canvas.width = cols * TILE_SIZE;
  canvas.height = rows * TILE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const jobs: Promise<void>[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = x0 + col;
      const y = y0 + row;
      const url = tileImageUrl(host, frame, z, x, y);
      jobs.push(
        loadImage(url, signal).then((img) => {
          if (!img) return;
          ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE);
        }),
      );
    }
  }
  await Promise.all(jobs);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Coarse block-match of weather motion (pixels) from previous → current.
 * Returned (dx, dy) is how far precip features moved; apply the same shift to
 * the current composite to extrapolate the next frame.
 */
export function estimateAdvectionShift(
  prev: ImageData,
  curr: ImageData,
): { dx: number; dy: number } {
  const w = Math.min(prev.width, curr.width);
  const h = Math.min(prev.height, curr.height);
  if (w < 32 || h < 32) return { dx: 0, dy: 0 };

  const step = Math.max(1, Math.floor(Math.min(w, h) / 128));
  const maxShift = Math.min(32, Math.floor(Math.min(w, h) / 6));
  const sampleStride = Math.max(2, step * 2);

  const scoreShift = (dx: number, dy: number): number | null => {
    let sad = 0;
    let n = 0;
    for (let y = maxShift; y < h - maxShift; y += sampleStride) {
      for (let x = maxShift; x < w - maxShift; x += sampleStride) {
        // prev[x,y] should match curr[x+dx,y+dy] when features moved by (dx,dy).
        const iPrev = (y * prev.width + x) * 4;
        const iCurr = ((y + dy) * curr.width + (x + dx)) * 4;
        if (iCurr < 0 || iCurr + 3 >= curr.data.length) continue;
        const aCurr = curr.data[iCurr + 3] ?? 0;
        const aPrev = prev.data[iPrev + 3] ?? 0;
        if (aCurr < 8 && aPrev < 8) continue;
        const p =
          (prev.data[iPrev] ?? 0) +
          (prev.data[iPrev + 1] ?? 0) +
          (prev.data[iPrev + 2] ?? 0);
        const c =
          (curr.data[iCurr] ?? 0) +
          (curr.data[iCurr + 1] ?? 0) +
          (curr.data[iCurr + 2] ?? 0);
        sad += Math.abs(p - c);
        n += 1;
      }
    }
    if (n < 6) return null;
    return sad / n;
  };

  let best = { dx: 0, dy: 0, score: Number.POSITIVE_INFINITY };

  for (let dy = -maxShift; dy <= maxShift; dy += step) {
    for (let dx = -maxShift; dx <= maxShift; dx += step) {
      const score = scoreShift(dx, dy);
      if (score == null) continue;
      if (score < best.score) best = { dx, dy, score };
    }
  }

  if (!Number.isFinite(best.score)) return { dx: 0, dy: 0 };

  // Local refine ±step
  const refine = Math.max(1, step);
  const cx = best.dx;
  const cy = best.dy;
  for (let dy = cy - refine; dy <= cy + refine; dy += 1) {
    for (let dx = cx - refine; dx <= cx + refine; dx += 1) {
      const score = scoreShift(dx, dy);
      if (score == null) continue;
      if (score < best.score) best = { dx, dy, score };
    }
  }

  return { dx: best.dx, dy: best.dy };
}

function shiftImageData(src: ImageData, dx: number, dy: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  const tmp = document.createElement('canvas');
  tmp.width = src.width;
  tmp.height = src.height;
  const tctx = tmp.getContext('2d');
  if (!tctx) return src;
  tctx.putImageData(src, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(tmp, Math.round(dx), Math.round(dy));
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

async function imageDataToBlobUrl(data: ImageData): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.putImageData(data, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Radar encode failed'))),
      'image/png',
    );
  });
  return URL.createObjectURL(blob);
}

/**
 * Build ~60 minutes of forecast frames by translating the latest composite
 * along the motion estimated from the previous two past frames.
 */
export async function generateAdvectionNowcast(
  opts: NowcastOptions,
): Promise<RadarFrame[]> {
  const past = opts.pastFrames.filter((f) => f.kind === 'past' && f.path);
  if (past.length < 2 || typeof document === 'undefined') return [];

  const steps = opts.steps ?? NOWCAST_FRAMES;
  const z = FETCH_ZOOM;
  const maxTile = 2 ** z;
  const cx = lon2tile(opts.lon, z);
  const cy = lat2tile(opts.lat, z);
  const x0 = Math.max(0, cx - TILE_RADIUS);
  const y0 = Math.max(0, cy - TILE_RADIUS);
  const x1 = Math.min(maxTile - 1, cx + TILE_RADIUS);
  const y1 = Math.min(maxTile - 1, cy + TILE_RADIUS);
  const cols = x1 - x0 + 1;
  const rows = y1 - y0 + 1;
  if (cols < 1 || rows < 1) return [];

  const prevFrame = past[past.length - 2]!;
  const currFrame = past[past.length - 1]!;

  const [prevImg, currImg] = await Promise.all([
    stitchFrame(opts.host, prevFrame, z, x0, y0, cols, rows, opts.signal),
    stitchFrame(opts.host, currFrame, z, x0, y0, cols, rows, opts.signal),
  ]);
  if (!prevImg || !currImg || opts.signal?.aborted) return [];

  const { dx, dy } = estimateAdvectionShift(prevImg, currImg);
  const west = tile2lon(x0, z);
  const east = tile2lon(x1 + 1, z);
  const north = tile2lat(y0, z);
  const south = tile2lat(y1 + 1, z);
  const coordinates: RadarFrame['coordinates'] = [
    [west, north],
    [east, north],
    [east, south],
    [west, south],
  ];

  const out: RadarFrame[] = [];
  let warped = currImg;
  for (let i = 1; i <= steps; i += 1) {
    if (opts.signal?.aborted) break;
    warped = shiftImageData(warped, dx, dy);
    // Soften confidence farther out by reducing alpha slightly.
    fadeAlpha(warped, 1 - i * 0.06);
    const imageUrl = await imageDataToBlobUrl(warped);
    out.push({
      time: currFrame.time + i * FRAME_STEP_SEC,
      path: currFrame.path,
      kind: 'nowcast',
      imageUrl,
      coordinates,
    });
  }
  return out;
}

function fadeAlpha(data: ImageData, factor: number): void {
  const f = Math.max(0.35, Math.min(1, factor));
  if (f >= 0.999) return;
  const buf = data.data;
  for (let i = 3; i < buf.length; i += 4) {
    buf[i] = Math.round((buf[i] ?? 0) * f);
  }
}

/** Release blob URLs created for extrapolated frames. */
export function revokeNowcastFrames(frames: RadarFrame[]): void {
  for (const f of frames) {
    if (f.imageUrl?.startsWith('blob:')) URL.revokeObjectURL(f.imageUrl);
  }
}
