/** MediaPipe Pose Landmarker — on-device landmark series. */

import {
  FilesetResolver,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { bodyMeanVisibility } from './geometry';
import type { LandmarkPoint, PoseFrame } from './types';

const MP_VERSION = '1.0.1';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let landmarkerPromise: Promise<PoseLandmarker> | null = null;

function toPoints(landmarks: NormalizedLandmark[]): LandmarkPoint[] {
  return landmarks.map((lm) => ({
    x: lm.x,
    y: lm.y,
    z: lm.z,
    visibility: lm.visibility ?? 0,
  }));
}

export async function getPoseLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      } catch {
        return PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      }
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

export async function detectPoseOnFrame(
  landmarker: PoseLandmarker,
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  timestampMs: number,
): Promise<PoseFrame | null> {
  const result = landmarker.detectForVideo(source, timestampMs);
  const pose = result.landmarks?.[0];
  if (!pose || pose.length < 33) return null;
  const landmarks = toPoints(pose);
  // Prefer world landmarks z when available for depth metrics.
  const world = result.worldLandmarks?.[0];
  if (world && world.length === landmarks.length) {
    for (let i = 0; i < landmarks.length; i++) {
      landmarks[i] = {
        ...landmarks[i],
        z: world[i].z,
      };
    }
  }
  return {
    t: timestampMs / 1000,
    landmarks,
    meanVisibility: bodyMeanVisibility(landmarks),
  };
}

/**
 * Walk a video and run pose on each sampled frame.
 * Uses requestVideoFrameCallback when available; otherwise seeks on a fixed grid.
 */
export async function extractPoseSeries(
  video: HTMLVideoElement,
  opts: {
    /** Hint from capture settings; used for seek fallback spacing. */
    fpsHint: number;
    onProgress?: (pct: number) => void;
  },
): Promise<{ frames: PoseFrame[]; sampleFps: number }> {
  const landmarker = await getPoseLandmarker();
  await waitForVideoReady(video);

  if (typeof video.requestVideoFrameCallback === 'function') {
    return extractViaFrameCallback(video, landmarker, opts.onProgress);
  }
  return extractViaSeek(video, landmarker, opts.fpsHint, opts.onProgress);
}

async function extractViaFrameCallback(
  video: HTMLVideoElement,
  landmarker: PoseLandmarker,
  onProgress?: (pct: number) => void,
): Promise<{ frames: PoseFrame[]; sampleFps: number }> {
  const frames: PoseFrame[] = [];
  const duration = Number.isFinite(video.duration) ? video.duration : 0;

  video.pause();
  video.currentTime = 0;
  await waitSeeked(video);

  await new Promise<void>((resolve, reject) => {
    let lastMediaTime = -1;
    let stamp = 0;

    const onFrame = (
      _now: number,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      try {
        if (metadata.mediaTime !== lastMediaTime) {
          lastMediaTime = metadata.mediaTime;
          stamp = Math.max(stamp + 1, Math.round(metadata.mediaTime * 1000));
          const pose = landmarker.detectForVideo(video, stamp);
          const lm = pose.landmarks?.[0];
          if (lm && lm.length >= 33) {
            const landmarks = toPoints(lm);
            const world = pose.worldLandmarks?.[0];
            if (world && world.length === landmarks.length) {
              for (let i = 0; i < landmarks.length; i++) {
                landmarks[i] = { ...landmarks[i], z: world[i].z };
              }
            }
            frames.push({
              t: metadata.mediaTime,
              landmarks,
              meanVisibility: bodyMeanVisibility(landmarks),
            });
          }
        }
        if (duration > 0) {
          onProgress?.(Math.min(99, (metadata.mediaTime / duration) * 100));
        }
        if (!video.ended && video.currentTime < (duration || Infinity) - 0.01) {
          video.requestVideoFrameCallback(onFrame);
        } else {
          onProgress?.(100);
          resolve();
        }
      } catch (e) {
        reject(e);
      }
    };

    video.requestVideoFrameCallback(onFrame);
    void video.play().catch(reject);
  });

  video.pause();
  const span =
    frames.length >= 2
      ? frames[frames.length - 1].t - frames[0].t
      : 0;
  const sampleFps =
    span > 0 ? (frames.length - 1) / span : optsFpsFallback(frames.length);
  return { frames, sampleFps };
}

function optsFpsFallback(n: number): number {
  return n > 1 ? 30 : 0;
}

async function extractViaSeek(
  video: HTMLVideoElement,
  landmarker: PoseLandmarker,
  fpsHint: number,
  onProgress?: (pct: number) => void,
): Promise<{ frames: PoseFrame[]; sampleFps: number }> {
  const fps = Math.min(Math.max(fpsHint || 30, 15), 120);
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    return { frames: [], sampleFps: 0 };
  }
  const step = 1 / fps;
  const frames: PoseFrame[] = [];
  let stamp = 0;

  for (let t = 0; t <= duration; t += step) {
    video.currentTime = Math.min(t, duration);
    await waitSeeked(video);
    stamp += Math.round(step * 1000);
    const frame = await detectPoseOnFrame(landmarker, video, stamp);
    if (frame) {
      frames.push({ ...frame, t });
    }
    onProgress?.(Math.min(99, (t / duration) * 100));
  }
  onProgress?.(100);
  return { frames, sampleFps: fps };
}

function waitForVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('Video failed to load'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('loadeddata', onOk);
    video.addEventListener('error', onErr);
  });
}

function waitSeeked(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (!video.seeking) {
      // currentTime assignment may become seeking asynchronously.
      const t = window.setTimeout(() => {
        if (!video.seeking) resolve();
      }, 0);
      const onSeeked = () => {
        window.clearTimeout(t);
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
  });
}
