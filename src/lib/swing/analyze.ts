/** Orchestrate Phase 1 swing analysis: pose → quality → segment → metrics. */

import { renderKeyframes } from './draw';
import { computeMetrics } from './metrics';
import { extractPoseSeries } from './pose';
import { assessCaptureQuality } from './quality';
import { segmentSwing } from './segment';
import { saveSwingAnalysis } from './storage';
import { buildRuleSummary } from './summary';
import type {
  CameraAngle,
  Handedness,
  SwingAnalysis,
  SwingReject,
  SwingResult,
} from './types';

export type AnalyzeProgress = {
  stage: 'pose' | 'measure' | 'done';
  pct: number;
};

export async function analyzeSwingVideo(opts: {
  blob: Blob;
  angle: CameraAngle;
  handedness: Handedness;
  /** Capture fps from getSettings(), or estimate for uploads. */
  fps: number;
  persist?: boolean;
  onProgress?: (p: AnalyzeProgress) => void;
}): Promise<SwingResult> {
  const url = URL.createObjectURL(opts.blob);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  try {
    opts.onProgress?.({ stage: 'pose', pct: 0 });
    const { frames, sampleFps } = await extractPoseSeries(video, {
      fpsHint: opts.fps || 30,
      onProgress: (pct) => opts.onProgress?.({ stage: 'pose', pct }),
    });

    // Prefer reported capture fps when available; else measured sample rate.
    const fps =
      opts.fps > 0
        ? opts.fps
        : sampleFps > 0
          ? sampleFps
          : 30;

    const quality = assessCaptureQuality(frames);
    if (!quality.ok) {
      const reject: SwingReject = {
        rejected: true,
        quality,
        fps,
        angle: opts.angle,
      };
      return reject;
    }

    opts.onProgress?.({ stage: 'measure', pct: 50 });
    const positions = segmentSwing(frames, opts.handedness);
    if (!positions) {
      return {
        rejected: true,
        quality: {
          ok: false,
          reason: 'too-short',
          message:
            'Couldn’t find address → top → impact → finish in this clip. Take a fuller swing and keep the whole body in frame.',
        },
        fps,
        angle: opts.angle,
      };
    }

    const metrics = computeMetrics(
      frames,
      positions,
      opts.angle,
      opts.handedness,
      fps,
    );
    const summary = buildRuleSummary(metrics, opts.angle, fps);
    opts.onProgress?.({ stage: 'measure', pct: 80 });

    const keyframes = await renderKeyframes(video, frames, positions);

    const analysis: SwingAnalysis = {
      id: `swing-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      angle: opts.angle,
      handedness: opts.handedness,
      fps,
      positions,
      metrics,
      summary,
      frames,
      keyframes,
    };

    if (opts.persist !== false) {
      saveSwingAnalysis(analysis);
    }

    opts.onProgress?.({ stage: 'done', pct: 100 });
    return analysis;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}
