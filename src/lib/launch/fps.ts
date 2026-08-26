/** Measure actual delivered frame rate from a video element. */

export async function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('Video failed to load'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('error', onErr);
  });
}

export async function waitSeeked(video: HTMLVideoElement): Promise<void> {
  if (!video.seeking) return;
  await new Promise<void>((resolve) => {
    video.addEventListener('seeked', () => resolve(), { once: true });
  });
}

/**
 * Count frames via requestVideoFrameCallback when available; otherwise seek grid.
 * Returns measured fps = frameCount / duration.
 */
export async function measureVideoFps(
  video: HTMLVideoElement,
  onProgress?: (pct: number) => void,
): Promise<{ fps: number; frameCount: number; duration: number }> {
  await waitForVideoReady(video);
  const duration = Number.isFinite(video.duration) ? video.duration : 0;
  if (duration <= 0) {
    throw new Error('Could not read video duration');
  }

  if (typeof video.requestVideoFrameCallback === 'function') {
    return measureViaFrameCallback(video, duration, onProgress);
  }
  return measureViaSeek(video, duration, onProgress);
}

async function measureViaFrameCallback(
  video: HTMLVideoElement,
  duration: number,
  onProgress?: (pct: number) => void,
): Promise<{ fps: number; frameCount: number; duration: number }> {
  let frameCount = 0;
  video.pause();
  video.currentTime = 0;
  await waitSeeked(video);

  await new Promise<void>((resolve, reject) => {
    let lastMediaTime = -1;

    const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
      if (metadata.mediaTime !== lastMediaTime) {
        lastMediaTime = metadata.mediaTime;
        frameCount++;
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
  const fps = frameCount / duration;
  onProgress?.(100);
  return { fps, frameCount, duration };
}

async function measureViaSeek(
  video: HTMLVideoElement,
  duration: number,
  onProgress?: (pct: number) => void,
): Promise<{ fps: number; frameCount: number; duration: number }> {
  /** Assume up to 240 fps for seek grid spacing. */
  const maxFps = 240;
  const step = 1 / maxFps;
  let frameCount = 0;
  video.pause();

  for (let t = 0; t < duration; t += step) {
    video.currentTime = t;
    await waitSeeked(video);
    frameCount++;
    onProgress?.(Math.min(99, (t / duration) * 100));
  }

  const fps = frameCount / duration;
  onProgress?.(100);
  return { fps, frameCount, duration };
}

export function tierFromFps(fps: number): 'swing-only' | 'launch-monitor' | 'high-precision' {
  if (fps >= 240) return 'high-precision';
  if (fps >= 120) return 'launch-monitor';
  return 'swing-only';
}
