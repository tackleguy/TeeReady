/** Sample video frames to canvas for CV analysis. */

import { waitForVideoReady, waitSeeked } from './fps';

export type SampledFrame = {
  index: number;
  t: number;
  width: number;
  height: number;
  /** RGBA pixel data. */
  data: Uint8ClampedArray;
};

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const ctx = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;

function captureFrame(
  video: HTMLVideoElement,
  index: number,
  t: number,
): SampledFrame | null {
  if (!canvas || !ctx) return null;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (w <= 0 || h <= 0) return null;
  canvas.width = w;
  canvas.height = h;
  ctx.drawImage(video, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return { index, t, width: w, height: h, data: imageData.data };
}

/**
 * Sample frames at approximately targetFps (capped by measured fps).
 * Returns downscaled analysis if needed — full resolution kept for overlay coords.
 */
export async function sampleVideoFrames(
  video: HTMLVideoElement,
  targetFps: number,
  onProgress?: (pct: number) => void,
): Promise<SampledFrame[]> {
  await waitForVideoReady(video);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) return [];

  const frames: SampledFrame[] = [];

  if (typeof video.requestVideoFrameCallback === 'function') {
    video.pause();
    video.currentTime = 0;
    await waitSeeked(video);

    await new Promise<void>((resolve, reject) => {
      let lastMediaTime = -1;
      let idx = 0;

      const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        if (metadata.mediaTime !== lastMediaTime) {
          lastMediaTime = metadata.mediaTime;
          const f = captureFrame(video, idx, metadata.mediaTime);
          if (f) frames.push(f);
          idx++;
          onProgress?.(Math.min(99, (metadata.mediaTime / duration) * 100));
        }
        if (metadata.mediaTime >= duration - 0.001) {
          resolve();
          return;
        }
        video.requestVideoFrameCallback(onFrame);
      };

      video.play().catch(reject);
      video.requestVideoFrameCallback(onFrame);
    });
    video.pause();
  } else {
    const step = 1 / Math.max(24, Math.min(targetFps, 240));
    video.pause();
    let idx = 0;
    for (let t = 0; t < duration; t += step) {
      video.currentTime = t;
      await waitSeeked(video);
      const f = captureFrame(video, idx, t);
      if (f) frames.push(f);
      idx++;
      onProgress?.(Math.min(99, (t / duration) * 100));
    }
  }

  onProgress?.(100);
  return frames;
}
