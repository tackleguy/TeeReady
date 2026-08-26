/** Launch monitor orchestrator — RECORD → DETECT → TRACK → CALCULATE. */

import { calibrateScale } from './calibrate';
import {
  MIN_CLIP_DURATION_S,
  MIN_SAMPLED_FRAMES,
  MIN_TRACK_POINTS,
} from './constants';
import { sampleVideoFrames } from './frames';
import { measureVideoFps, tierFromFps, waitForVideoReady } from './fps';
import { computeLaunchMetrics } from './physics';
import { trackBall } from './track';
import type {
  AnalyzeLaunchProgress,
  LaunchAnalysis,
  LaunchReject,
  LaunchResult,
} from './types';
import {
  inferCameraAngleFromTrack,
  validatePreImpactBall,
  validateSetup,
} from './validate';

function makeId(): string {
  return `launch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function blobToVideo(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.playsInline = true;
  video.muted = true;
  video.src = url;
  try {
    await waitForVideoReady(video);
    return video;
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function analyzeLaunchVideo(opts: {
  blob: Blob;
  angle?: 'face-on' | 'dtl' | 'auto';
  club?: string;
  onProgress?: (p: AnalyzeLaunchProgress) => void;
}): Promise<LaunchResult> {
  const { blob, club, onProgress } = opts;
  let video: HTMLVideoElement | null = null;

  try {
    video = await blobToVideo(blob);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    if (duration < MIN_CLIP_DURATION_S) {
      return {
        ok: false,
        reason: 'too-short',
        message: `Clip is too short (${duration.toFixed(1)}s). Need at least ${MIN_CLIP_DURATION_S}s including post-impact flight.`,
      };
    }

    onProgress?.({ stage: 'fps', pct: 0 });
    const { fps, frameCount } = await measureVideoFps(video, (pct) =>
      onProgress?.({ stage: 'fps', pct: pct * 0.25 }),
    );

    onProgress?.({ stage: 'track', pct: 25 });
    const frames = await sampleVideoFrames(video, fps, (pct) =>
      onProgress?.({ stage: 'track', pct: 25 + pct * 0.5 }),
    );

    if (frames.length < MIN_SAMPLED_FRAMES) {
      return {
        ok: false,
        reason: 'too-few-frames',
        message: `Could not sample enough frames (${frames.length}). Try a shorter clip or different format.`,
      };
    }

    const { track, impactIndex } = trackBall(frames, fps);

    if (track.length < MIN_TRACK_POINTS) {
      return {
        ok: false,
        reason: 'no-track',
        message: `Ball flight not tracked (${track.length} points). Use slow-mo, keep the ball in frame 1–2s after impact, and aim at a bright ball on turf.`,
      };
    }

    const angle =
      opts.angle && opts.angle !== 'auto'
        ? opts.angle
        : inferCameraAngleFromTrack(track);

    const setup = validateSetup(fps, duration, frameCount, track, angle);
    if (!setup.ok) {
      return {
        ok: false,
        reason: 'setup',
        message: setup.errors.join(' '),
      };
    }

    onProgress?.({ stage: 'physics', pct: 80 });

    const preImpact = frames.slice(Math.max(0, impactIndex - 8), impactIndex);
    const scaleWarning = validatePreImpactBall(frames, impactIndex);
    const scale = calibrateScale(preImpact);

    const physics = computeLaunchMetrics({
      track,
      fps,
      angle,
      scale,
      club,
    });

    if (scaleWarning && !scale) {
      physics.unavailable.ball_speed =
        physics.unavailable.ball_speed ??
        'Ball not detected at address for scale calibration.';
    }

    const impactFrame = frames[impactIndex];
    const analysis: LaunchAnalysis = {
      ok: true,
      id: makeId(),
      createdAt: Date.now(),
      angle,
      fps,
      tier: tierFromFps(fps),
      impactFrameIndex: impactIndex,
      impactTime: impactFrame?.t ?? track[0]!.t,
      track,
      scale,
      metrics: physics.metrics,
      unavailable: physics.unavailable,
      setupWarnings: [...setup.warnings, ...(scaleWarning ? [scaleWarning] : [])],
    };

    onProgress?.({ stage: 'physics', pct: 100 });
    return analysis;
  } finally {
    if (video?.src) URL.revokeObjectURL(video.src);
  }
}

export type { LaunchReject };
